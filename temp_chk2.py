import json
d=json.load(open("data/funds.json",encoding="utf-8"))
print("tags occurrences:", json.dumps(d).count('"tags"'))
