.PHONY: help deps dev import fetch-users build clean clean-baseline check lint lint-fix format format-check test test-watch test-coverage ci

LDAP_HOST  ?= ldaps://ldap.example.com
LDAP_BASE  ?= dc=example,dc=com

LDAP_ATTRS := cn rhatJobRole rhatJobTitle manager uid title \
	rhatPreferredLastName displayName rhatLocation rhatOfficeLocation \
	rhatGeo preferredTimeZone rhatHireDate rhatPrimaryMail \
	rhatOriginalHireDate rhatPreferredAlias rhatSocialURL rhatPronouns \
	c co st l \
	rhatWorkerId rhatCostCenter rhatCostCenterDesc

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

deps: ## Install Node dependencies (npm install)
	npm install

dev: data/baseline.json ## Start the dev server (Vite + API)
	npm run dev

import: data/baseline.json ## (Re-)import org data → data/baseline.json
	@echo "baseline.json is up to date"

data/baseline.json: data/all_users.json
	npm run import

data/all_users.json: ## Fetch from LDAP and enrich (requires LDAP access + ldap-utils)
	@mkdir -p data
	@echo "Fetching from LDAP..."
	ldapsearch -H $(LDAP_HOST) -b $(LDAP_BASE) -Y GSSAPI employeeType=Employee $(LDAP_ATTRS) > data/all_users_ldif
	@echo "Converting LDIF to JSON..."
	uvx --with geonamescache python scripts/ldif_to_json.py data/all_users_ldif > data/all_users_temp.json
	@echo "Enriching with geocoding + report counts..."
	uvx --with geonamescache python scripts/enrich_users.py data/all_users_temp.json > data/all_users.json
	@rm -f data/all_users_ldif data/all_users_temp.json
	@echo "Done — data/all_users.json ready"

fetch-users: ## Fetch LDAP data → data/all_users.json (requires LDAP access + ldap-utils)
	@rm -f data/all_users.json
	$(MAKE) data/all_users.json

build: data/baseline.json ## Build for production
	npm run build

check: ## TypeScript type check
	npx tsc --noEmit -p tsconfig.app.json

lint: ## Run ESLint
	npx eslint .

lint-fix: ## Run ESLint with auto-fix
	npx eslint --fix .

format: ## Format all files with Prettier
	npx prettier --write .

format-check: ## Check formatting without writing
	npx prettier --check .

ci: ## Run all checks: typecheck + lint + format + test
	npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npx prettier --check . && npx vitest run

test: ## Run unit and integration tests
	npx vitest run

test-watch: ## Run tests in watch mode
	npx vitest

test-coverage: ## Run tests with coverage report
	npx vitest run --coverage

clean: ## Remove build output, imported data, and node_modules
	rm -rf dist/ data/ .vite/ node_modules/

clean-baseline: ## Remove only the processed baseline (keep all_users.json)
	rm -f data/baseline.json
