#!/usr/bin/env python3
"""Aplica manifestos no cluster via API (server-side apply) — sem depender de kubectl.

uso:  python3 scripts/k8s_apply.py k8s/.rendered/*.yaml
      python3 scripts/k8s_apply.py --dry-run k8s/*.yaml        # valida no servidor sem gravar
      python3 scripts/k8s_apply.py --status            # espera os pods ficarem prontos
      python3 scripts/k8s_apply.py --get pods          # lista os pods do namespace
      python3 scripts/k8s_apply.py --exists Secret planet-db   # exit 0 se existe, 1 se não

Lê o kubeconfig de $KUBECONFIG (ou o caminho padrão do OpenLens). Os certificados são
escritos num diretório temporário com permissão 0600 e apagados no fim.
"""
import base64, json, os, ssl, sys, tempfile, shutil, time, urllib.request, urllib.error, urllib.parse
import yaml

KUBECONFIG = os.environ.get(
    "KUBECONFIG",
    os.path.expanduser("~/.config/OpenLens/kubeconfigs/68c0dd84-fd6a-43f2-bc30-26daccdf7ef4"))
NS = os.environ.get("PLANET_NS", "planet")
FIELD_MANAGER = "planet-deploy"

# kind -> (grupo/versão, plural, tem namespace?)
RESOURCES = {
    "Namespace":   ("api/v1", "namespaces", False),
    "Service":     ("api/v1", "services", True),
    "ConfigMap":   ("api/v1", "configmaps", True),
    "Secret":      ("api/v1", "secrets", True),
    "Deployment":  ("apis/apps/v1", "deployments", True),
    "StatefulSet": ("apis/apps/v1", "statefulsets", True),
    "Ingress":     ("apis/networking.k8s.io/v1", "ingresses", True),
    "CronJob":     ("apis/batch/v1", "cronjobs", True),   # batch/v1 é GA desde o k8s 1.21 (este cluster)
}


class Cluster:
    def __init__(self):
        cfg = yaml.safe_load(open(KUBECONFIG))
        ctx_name = cfg.get("current-context")
        ctx = next(c["context"] for c in cfg["contexts"] if c["name"] == ctx_name)
        cluster = next(c["cluster"] for c in cfg["clusters"] if c["name"] == ctx["cluster"])
        user = next(u["user"] for u in cfg["users"] if u["name"] == ctx["user"])
        self.server = cluster["server"].rstrip("/")
        self.dir = tempfile.mkdtemp(prefix="planet-kube-")
        os.chmod(self.dir, 0o700)
        self.ca = self._write("ca.crt", cluster["certificate-authority-data"])
        crt = self._write("client.crt", user["client-certificate-data"])
        key = self._write("client.key", user["client-key-data"])
        self.ctx = ssl.create_default_context(cafile=self.ca)
        self.ctx.load_cert_chain(crt, key)

    def _write(self, name, b64):
        p = os.path.join(self.dir, name)
        with open(os.open(p, os.O_CREAT | os.O_WRONLY, 0o600), "wb") as f:
            f.write(base64.b64decode(b64))
        return p

    def close(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def request(self, method, path, body=None, content_type="application/json"):
        url = self.server + path
        data = body.encode() if isinstance(body, str) else body
        req = urllib.request.Request(url, data=data, method=method)
        if data:
            req.add_header("Content-Type", content_type)
        req.add_header("Accept", "application/json")
        try:
            with urllib.request.urlopen(req, context=self.ctx, timeout=30) as r:
                return json.loads(r.read() or "{}")
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                return json.loads(raw)
            except Exception:
                return {"kind": "Status", "status": "Failure", "message": raw.decode()[:300], "code": e.code}


def path_for(kind, name=None, ns=NS):
    api, plural, namespaced = RESOURCES[kind]
    base = f"/{api}/namespaces/{ns}/{plural}" if namespaced else f"/{api}/{plural}"
    return base + (f"/{urllib.parse.quote(name)}" if name else "")


def apply(cl, doc, dry_run=False):
    kind = doc["kind"]
    name = doc["metadata"]["name"]
    ns = doc["metadata"].get("namespace", NS)
    # kind fora da tabela: reporta e segue. Antes isto estourava um KeyError no meio do laço e derrubava o
    # deploy INTEIRO — um manifesto novo levava o app junto, que é o oposto do que se quer de um applier.
    if kind not in RESOURCES:
        print(f"  ERRO  {kind}/{name}: kind desconhecido (acrescente em RESOURCES)")
        return False
    p = path_for(kind, name, ns) + f"?fieldManager={FIELD_MANAGER}&force=true" + ("&dryRun=All" if dry_run else "")
    res = cl.request("PATCH", p, yaml.safe_dump(doc), "application/apply-patch+yaml")
    if res.get("kind") == "Status" and res.get("status") == "Failure":
        print(f"  ERRO  {kind}/{name}: {res.get('message','')[:200]}")
        return False
    print(f"  ok    {kind}/{name}{' (dry-run)' if dry_run else ''}")
    return True


def status(cl):
    """Espera o StatefulSet e o Deployment ficarem prontos."""
    alvos = [("StatefulSet", "planet-server"), ("Deployment", "planet-client")]
    prazo = time.time() + 240
    while time.time() < prazo:
        pronto = True
        linhas = []
        for kind, name in alvos:
            o = cl.request("GET", path_for(kind, name))
            st = o.get("status", {}) or {}
            desejado = (o.get("spec", {}) or {}).get("replicas", 0)
            ok = st.get("readyReplicas", 0)
            # num rolling update o readyReplicas continua cheio com os pods antigos:
            # só está pronto quando todos já estão na revisão nova
            atualizados = st.get("updatedReplicas", 0)
            mesma_rev = st.get("currentRevision") == st.get("updateRevision") if kind == "StatefulSet" else True
            linhas.append(f"{name}: {ok}/{desejado} prontos, {atualizados}/{desejado} na versão nova")
            if ok != desejado or atualizados != desejado or not mesma_rev:
                pronto = False
        print("  " + " | ".join(linhas))
        if pronto:
            return True
        time.sleep(6)
    return False


def get(cl, what):
    if what == "pods":
        o = cl.request("GET", f"/api/v1/namespaces/{NS}/pods")
        for p in o.get("items", []):
            st = p.get("status", {})
            cs = st.get("containerStatuses") or []
            print(f"  {p['metadata']['name']:<22} {st.get('phase',''):<10} "
                  f"ready={sum(1 for c in cs if c.get('ready'))}/{len(cs)} "
                  f"restarts={sum(c.get('restartCount',0) for c in cs)} node={st.get('hostIP','')}")
    else:
        print(json.dumps(cl.request("GET", what), indent=2)[:4000])


if __name__ == "__main__":
    cl = Cluster()
    try:
        args = sys.argv[1:]
        if not args:
            print(__doc__)
        elif args[0] == "--status":
            sys.exit(0 if status(cl) else 1)
        elif args[0] == "--get":
            get(cl, args[1] if len(args) > 1 else "pods")
        elif args[0] == "--exists":
            o = cl.request("GET", path_for(args[1], args[2]))
            ok = o.get("kind") == args[1]
            print(f"  {args[1]}/{args[2]}: {'existe' if ok else 'NÃO existe'}")
            sys.exit(0 if ok else 1)
        else:
            # --dry-run: valida os manifestos contra o servidor sem gravar nada (bom antes de um deploy)
            dry = args[0] == "--dry-run"
            if dry:
                args = args[1:]
            falhas = 0
            for f in args:
                print(f"{f}:")
                for doc in yaml.safe_load_all(open(f)):
                    if doc and not apply(cl, doc, dry):
                        falhas += 1
            sys.exit(1 if falhas else 0)
    finally:
        cl.close()
