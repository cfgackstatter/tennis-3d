.PHONY: help install launch dev test build preview clean

.DEFAULT_GOAL := help

help:
	@echo "Tennis 3D"
	@echo
	@echo "  make install   Install npm dependencies"
	@echo "  make launch    Start the dev server (installs first if needed)"
	@echo "  make test      Run physics tests"
	@echo "  make build     Build production files into dist/"
	@echo "  make preview   Serve the production build"
	@echo "  make clean     Remove dist/ and node_modules/"

install:
	npm install

launch: node_modules
	npm run dev

dev: launch

test: node_modules
	npm test

build: node_modules
	npm run build

preview: node_modules
	npm run preview

node_modules: package.json package-lock.json
	npm install

clean:
	rm -rf dist node_modules
