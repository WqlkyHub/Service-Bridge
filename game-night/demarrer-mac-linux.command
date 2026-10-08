#!/bin/bash
# Double-cliquez ce fichier pour lancer le serveur de soirée.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js n'est pas installé sur cet ordinateur."
  echo "  Installez-le depuis https://nodejs.org (version LTS), puis relancez ce fichier."
  echo
  read -n 1 -s -r -p "  Appuyez sur une touche pour fermer."
  exit 1
fi

if [ ! -f soiree.json ]; then
  cp soiree-depart.json soiree.json
  echo "  Soirée initialisée avec les joueurs et les défis."
fi

node server.js
