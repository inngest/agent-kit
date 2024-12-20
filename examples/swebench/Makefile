.PHONY: init
init:
	mkdir -p ./opt/
	if which wget >/dev/null; then \
		wget -O ./opt/dev.parquet https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite/resolve/main/data/dev-00000-of-00001.parquet?download=true; \
	else \
		curl -L https://huggingface.co/datasets/princeton-nlp/SWE-bench_Lite/resolve/main/data/dev-00000-of-00001.parquet?download=true -o ./opt/dev.parquet; \
	fi