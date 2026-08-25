import re, os, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
root = r'D:\project\midcine\apps\web'
arabic = re.compile(r'[؀-ۿݐ-ݿࢠ-ࣿ]')
skip_dirs = ('node_modules', '.next', '.turbo', '_components\\anatomy')
files_with = []
for dp, _, files in os.walk(root):
    if any(s in dp for s in skip_dirs):
        continue
    for f in files:
        if not (f.endswith('.tsx') or f.endswith('.ts')):
            continue
        p = os.path.join(dp, f)
        try:
            with open(p, encoding='utf-8') as fh:
                lines = fh.readlines()
        except Exception:
            continue
        hits = [(i+1, l.rstrip()) for i, l in enumerate(lines) if arabic.search(l)]
        if hits:
            files_with.append((os.path.relpath(p, root), hits))
print(f'{len(files_with)} non-anatomy files with Arabic\n')
for rel, hits in files_with:
    print(f'### {rel} ({len(hits)} lines)')
    for ln, txt in hits[:8]:
        try:
            print(f'  L{ln}: {txt[:200]}')
        except UnicodeEncodeError:
            print(f'  L{ln}: <arabic text>')
