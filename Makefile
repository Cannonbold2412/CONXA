# Conxa dev/prod launcher shortcuts. Thin wrappers over scripts/conxa.sh so the
# single switch (CONXA_ENV) drives isolated Dev and Prod lanes. See docs/TRD.md
# "Dev/Prod Environment Isolation".
#
# Examples:
#   make dev-studio      # Build Studio, dev lane (~/.conxa-build-studio-dev, dev cloud)
#   make dev-backend     # Cloud backend, dev lane (filesystem store, auth off)
#   make prod-backend    # Cloud backend, prod lane (needs .env.prod fully set)
#   make dev-env         # Print the resolved dev environment and exit

SHELL := /bin/bash
CONXA := ./scripts/conxa.sh

.PHONY: dev-backend dev-frontend dev-studio dev-runtime dev-env \
        prod-backend prod-frontend prod-studio prod-runtime prod-env

dev-backend:   ; $(CONXA) dev backend
dev-frontend:  ; $(CONXA) dev frontend
dev-studio:    ; $(CONXA) dev studio
dev-runtime:   ; $(CONXA) dev runtime
dev-env:       ; $(CONXA) dev env

prod-backend:  ; $(CONXA) prod backend
prod-frontend: ; $(CONXA) prod frontend
prod-studio:   ; $(CONXA) prod studio
prod-runtime:  ; $(CONXA) prod runtime
prod-env:      ; $(CONXA) prod env
