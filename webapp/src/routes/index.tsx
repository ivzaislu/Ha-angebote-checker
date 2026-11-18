import { createFileRoute } from "@tanstack/react-router";
import { AngeboteApp } from "@/components/angebote-app";

export const Route = createFileRoute("/")({ component: AngeboteApp });
