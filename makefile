docker-build:
	docker-compose up --build

docker-run:
	docker-compose up -d

docker-stop:
	docker-compose down

codegen:
	npm run codegen

dev:
	npm run dev

setup-certs:
	node setup-certs.js
