
#!/bin/bash
export COMMANDLINE_ARGS="--skip-torch-cuda-test --use-cpu all"
source venv/Scripts/activate
python launch.py
