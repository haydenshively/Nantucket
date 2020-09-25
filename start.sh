#!/bin/bash -i

tmux new-session -d -s geth
tmux send-keys -t geth "geth --config /home/haydenshively/Developer/Nantucket/geth.toml" ENTER

tmux new-session -d -s nantucket
tmux send-keys -t nantucket "sleep 60 && yarn --cwd /home/haydenshively/Developer/Nantucket/ nantucket" ENTER
