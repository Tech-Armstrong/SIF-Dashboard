"""Print Neo4j schema summary (labels, relationships, properties, counts)."""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

uri = os.getenv("NEO4J_URI")
user = os.getenv("NEO4J_USERNAME")
password = os.getenv("NEO4J_PASSWORD")
database = os.getenv("NEO4J_DATABASE", "neo4j")


def main() -> int:
    missing = [
        name
        for name, val in [
            ("NEO4J_URI", uri),
            ("NEO4J_USERNAME", user),
            ("NEO4J_PASSWORD", password),
        ]
        if not val
    ]
    if missing:
        print("Missing env vars:", ", ".join(missing), file=sys.stderr)
        return 1

    driver = GraphDatabase.driver(uri, auth=(user, password))

    def run(q: str, **params):
        with driver.session(database=database) as session:
            return [dict(r) for r in session.run(q, **params)]

    print("=== NODE LABELS ===")
    for row in run("CALL db.labels() YIELD label RETURN label ORDER BY label"):
        print("-", row["label"])

    print("\n=== RELATIONSHIP TYPES ===")
    for row in run(
        "CALL db.relationshipTypes() YIELD relationshipType "
        "RETURN relationshipType ORDER BY relationshipType"
    ):
        print("-", row["relationshipType"])

    print("\n=== PROPERTY KEYS ===")
    for row in run(
        "CALL db.propertyKeys() YIELD propertyKey RETURN propertyKey ORDER BY propertyKey"
    ):
        print("-", row["propertyKey"])

    print("\n=== NODE COUNTS BY LABEL ===")
    for row in run(
        """
        MATCH (n)
        UNWIND labels(n) AS label
        RETURN label, count(*) AS count
        ORDER BY count DESC, label
        """
    ):
        print(f"- {row['label']}: {row['count']}")

    print("\n=== RELATIONSHIP COUNTS BY TYPE ===")
    for row in run(
        """
        MATCH ()-[r]->()
        RETURN type(r) AS type, count(*) AS count
        ORDER BY count DESC, type
        """
    ):
        print(f"- {row['type']}: {row['count']}")

    print("\n=== PROPERTIES BY LABEL ===")
    for row in run(
        """
        MATCH (n)
        UNWIND labels(n) AS label
        WITH label, collect(keys(n)) AS keyLists
        RETURN label,
          reduce(keys = [], kl IN keyLists | keys + [k IN kl WHERE NOT k IN keys | k]) AS properties
        ORDER BY label
        """
    ):
        props = ", ".join(row["properties"]) if row["properties"] else "(none)"
        print(f"- {row['label']}: {props}")

    print("\n=== RELATIONSHIP PATTERNS ===")
    for row in run(
        """
        MATCH (a)-[r]->(b)
        WITH labels(a) AS fromLabels, type(r) AS relType, labels(b) AS toLabels, count(*) AS count
        RETURN fromLabels, relType, toLabels, count
        ORDER BY count DESC, relType
        """
    ):
        fl = ":".join(row["fromLabels"]) if row["fromLabels"] else "(no label)"
        tl = ":".join(row["toLabels"]) if row["toLabels"] else "(no label)"
        print(f"- ({fl})-[:{row['relType']}]->({tl})  x{row['count']}")

    print("\n=== CONSTRAINTS ===")
    try:
        constraints = run("SHOW CONSTRAINTS")
        if constraints:
            for c in constraints:
                print("-", c)
        else:
            print("(none)")
    except Exception as exc:
        print("Could not fetch constraints:", exc)

    print("\n=== INDEXES ===")
    try:
        indexes = run("SHOW INDEXES")
        if indexes:
            for idx in indexes:
                print("-", idx)
        else:
            print("(none)")
    except Exception as exc:
        print("Could not fetch indexes:", exc)

    driver.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
