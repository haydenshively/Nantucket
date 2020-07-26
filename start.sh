#!/bin/bash -i

tmux new-session -d -s geth
tmux send-keys -t geth "geth --cache 7000 --rpc.txfeecap 10" ENTER

tmux new-session -d -s nantucket
tmux send-keys -t nantucket "sleep 60 && yarn --cwd /home/haydenshively/Developer/Nantucket/ nantucket" ENTER
