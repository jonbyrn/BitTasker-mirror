#!/usr/bin/env bash
# Resolve the Workers token the same way deploy-sandbox does.
# Prints lengths only. Never prints the token or any secret value.
set -e

fetch_scoped_var() {
	FETCH_KEY="$1" node --input-type=module -e 'const key=process.env.FETCH_KEY; const base=process.env.CI_API_V4_URL; const project=process.env.CI_PROJECT_ID; const job=process.env.CI_JOB_TOKEN; const api=process.env.CI_API_TOKEN; if(!key||!base||!project) process.exit(1); const headers=[]; if(job) headers.push(["JOB-TOKEN",job]); if(api) headers.push(["PRIVATE-TOKEN",api]); const notes=[]; for (const [name,header] of headers) { for (const scope of ["development","production","*"]) { const url=base+"/projects/"+encodeURIComponent(project)+"/variables/"+encodeURIComponent(key)+"?filter%5Benvironment_scope%5D="+encodeURIComponent(scope); try { const response=await fetch(url,{headers:{[name]:header}}); notes.push(name+"/"+scope+":"+response.status); if(!response.ok) continue; const body=await response.json(); if(typeof body.value==="string" && body.value.length>0 && !body.value.startsWith("$")) { console.error("variable lookup "+key+" "+notes.join(",")); process.stdout.write(body.value); process.exit(0); } } catch (error) { notes.push(name+"/"+scope+":error"); } } } console.error("variable lookup "+key+" "+(notes.join(",")||"no-token")); process.exit(1);'
}

if [ -n "${CI_API_TOKEN-}" ]; then api_state=set; else api_state=unset; fi
echo "env=${CI_ENVIRONMENT_NAME:-unset} protected=${CI_COMMIT_REF_PROTECTED:-unset} ci_api_token=${api_state}"

classify() {
	raw=$(printenv "$1" || true)
	if [ -z "$raw" ]; then
		echo "$1=unset"
	else
		case "$raw" in
			\$*) echo "$1=literal" ;;
			*) echo "$1=set length=${#raw}" ;;
		esac
	fi
}

classify CLOUDFLARE_API_TOKEN
classify CLOUDFLARE_ACCOUNT_ID
classify CF_API_TOKEN
classify CF_ACCOUNT_ID

bad() {
	case "$1" in
		''|\$*) return 0 ;;
		*) return 1 ;;
	esac
}

if bad "${CLOUDFLARE_API_TOKEN-}" && ! bad "${CF_API_TOKEN-}"; then
	export CLOUDFLARE_API_TOKEN="$CF_API_TOKEN"
fi
if bad "${CLOUDFLARE_ACCOUNT_ID-}" && ! bad "${CF_ACCOUNT_ID-}"; then
	export CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT_ID"
fi
if bad "${CLOUDFLARE_API_TOKEN-}"; then
	fetched=$(FETCH_KEY=CLOUDFLARE_API_TOKEN fetch_scoped_var CLOUDFLARE_API_TOKEN || true)
	if [ -n "$fetched" ]; then export CLOUDFLARE_API_TOKEN="$fetched"; fi
fi
if bad "${CLOUDFLARE_ACCOUNT_ID-}"; then
	fetched=$(FETCH_KEY=CLOUDFLARE_ACCOUNT_ID fetch_scoped_var CLOUDFLARE_ACCOUNT_ID || true)
	if [ -n "$fetched" ]; then export CLOUDFLARE_ACCOUNT_ID="$fetched"; fi
fi
unset fetched raw

token=$(printf '%s' "${CLOUDFLARE_API_TOKEN-}" | tr -d '\r\n')
token=${token#"Bearer "}
token=${token#"bearer "}
token=$(printf '%s' "$token" | tr -d ' \t')
account=$(printf '%s' "${CLOUDFLARE_ACCOUNT_ID-}" | tr -d ' \t\r\n')
case "$token" in
	''|\$*)
		echo "Cloudflare token is missing. protected=${CI_COMMIT_REF_PROTECTED:-unset} env=${CI_ENVIRONMENT_NAME:-unset}."
		echo "The Workers token is scoped to the development environment. This job uses that name with action prepare."
		echo "A protected variable is also injected only on a protected branch."
		exit 1
		;;
esac
case "$account" in
	''|\$*)
		echo "Cloudflare account id is missing or still an unexpanded CI variable. Preview stopped."
		exit 1
		;;
esac
export CLOUDFLARE_API_TOKEN="$token"
export CLOUDFLARE_ACCOUNT_ID="$account"
unset CF_API_TOKEN CF_ACCOUNT_ID
echo "Cloudflare token length ${#CLOUDFLARE_API_TOKEN}, account length ${#CLOUDFLARE_ACCOUNT_ID}"
