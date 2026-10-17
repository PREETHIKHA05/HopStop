
from collections import defaultdict

def analyze_fund_flow(transfers):
    graph = defaultdict(list)

    for transfer in transfers:
        graph[transfer["from"]].append({
            "to": transfer["to"],
            "amount": float(transfer["amount"]),
            "seconds": int(transfer["seconds"])
        })

    suspicious_chains = []
    seen = set()
    max_depth = 4

    def walk(account, path, visited):
        if len(path) >= max_depth:
            return

        for transfer in graph.get(account, []):
            next_account = transfer["to"]

            # Prevent cycles in an individual path.
            if next_account in visited:
                continue

            next_path = path + [{
                "from": account,
                "to": next_account,
                "amount": transfer["amount"],
                "seconds": transfer["seconds"]
            }]

            has_rapid_transfer = any(
                item["seconds"] <= 60 for item in next_path
            )

            if len(next_path) >= 2 and has_rapid_transfer:
                chain_key = tuple(
                    (item["from"], item["to"], item["seconds"])
                    for item in next_path
                )

                if chain_key not in seen:
                    seen.add(chain_key)
                    suspicious_chains.append({
                        "accounts": [next_path[0]["from"]]
                            + [item["to"] for item in next_path],
                        "transfer_count": len(next_path),
                        "rapid_transfer_detected": True,
                        "transfers": next_path
                    })

            walk(
                next_account,
                next_path,
                visited | {next_account}
            )

    for account in graph:
        walk(account, [], {account})

    return {
        "transfers_analyzed": len(transfers),
        "suspicious_chains": suspicious_chains,
        "note": "Potential risk patterns only; not proof of fraud."
    }
