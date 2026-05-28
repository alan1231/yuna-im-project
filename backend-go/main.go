package main

import (
	"log"

	"backend-go/internal/chat"
)

func main() {
	if err := chat.Run(chat.LoadConfig()); err != nil {
		log.Fatal(err)
	}
}
