#!/usr/bin/env python3
"""Reference for P10 (round 2): counts chapter facts and threads whose evidence is weak.

Usage: python3 -I weak_evidence.py <date folder> [run-dir-name ...]
Reads <date folder>/<run>/calls/*chapter-extract.json (one per run) and prints per-run and total counts.
The TypeScript in src/ai/evidence-anchor.ts must give the same answers as the two predicates below.
"""
import glob, json, os, re, sys

# --- particles, copied from src/lib/korean/josa.ts (PARTICLE_LIST, longest first) ---
LIST = ('은 는 이 가 을 를 의 에 에게 에게서 에서 와 과 로 으로 도 만 께 께서 한테 한테서 랑 이랑 나 이나 야 아 여 이여 '
        '부터 까지 처럼 보다 조차 마저 라도 이라도 만큼 뿐 밖에 요 이요 이며 며 하고 들 이다 이었다 였다 이야 입니다 이에요 예요 이지 이고')
JOSA = sorted(dict.fromkeys(LIST.split(' ')), key=lambda t: -len(t))
HANGUL = re.compile(r'[가-힣]')

def has_jong(ch): return 0xAC00 <= ord(ch) <= 0xD7A3 and (ord(ch) - 0xAC00) % 28 > 0
def strip_one(s):
    for t in JOSA:
        if not s.endswith(t) or len(s) - len(t) < 2: continue
        if t == '이' and not has_jong(s[len(s) - len(t) - 1]): continue
        return s[:len(s) - len(t)]
    return s
def strip_josa(w): return strip_one(strip_one(w))
def josa_forms(w):
    forms = [w.strip()]
    for _ in range(2):
        nxt = strip_one(forms[-1])
        if nxt == forms[-1]: break
        forms.append(nxt)
    return forms

def norm(s):
    s = s.replace('‘', "'").replace('’', "'").replace('“', '"').replace('”', '"')
    return re.sub(r'\s+', ' ', s).strip().lower()
def is_word(ch): return bool(ch) and bool(re.match(r'[^\W_]', ch, re.U))
def contains(text, term):
    if not term: return False
    if HANGUL.search(term): return term in text
    i = text.find(term)
    while i >= 0:
        if i == 0 or not is_word(text[i - 1]): return True
        i = text.find(term, i + 1)
    return False

NAME_STOP = {'the', 'and', 'for'}
def subject_forms(names, kind):
    """kind: None or an entry kind. Forms are normalized."""
    forms, is_char = [], kind in (None, 'character')
    def add(f):
        f = norm(f)
        if f and f not in forms: forms.append(f)
    for raw in names:
        n = raw.strip()
        if len(n) < 2: continue
        add(n)
        words = n.split()
        if len(words) >= 2:
            for w in words:
                w = re.sub(r"'s$|'$", '', w.replace('’', "'"))
                if HANGUL.search(w):
                    if len(w) >= 2: add(w)
                else:
                    wl = w.lower()
                    if re.fullmatch(r'[a-z]+', wl) and len(wl) >= (4 if is_char else 3) and wl not in NAME_STOP: add(wl)
        elif re.fullmatch(r'[가-힣]+', n) and is_char:
            if len(n) == 3: add(n[1:])
            if len(n) == 4: add(n[1:]); add(n[2:])
    return forms

def evidence_names_subject(evidence, names, kind):
    forms = subject_forms(names, kind)
    if not forms: return True            # nothing to check against
    ev = norm(evidence)
    return any(contains(ev, f) for f in forms)

STOP_EN = set(('the and for with from into onto upon are was were been being its this that these those who whom whose what '
 'which when where why how whether then than but not nor yet still also just only even very too any all some each both either '
 'neither one two has have had having did does done doing can could will would shall should may might must get got let her his '
 'she him they them their there here about after before between over under down out off again once while because since until '
 'though although else ever never every other another such own same more most much many few less').split())
STOP_KO = set('아직 않았다 않은 않는 있는 없는 드러나지 드러난 그의 그녀 대해 때문 이후 모두 다시 그리고 하지만 그래서'.split())
def thread_keywords(text):
    out = []
    for tok in re.split(r'[\s,.;:!?"“”‘’()\[\]{}/·–—~…-]+', text.replace('’', "'")):
        tok = tok.strip("'")
        if not tok: continue
        if HANGUL.search(tok):
            k = strip_josa(tok).lower()
            if len(k) < 2 or k in STOP_KO: continue
        else:
            k = re.sub(r"'s$", '', tok.lower())
            if not re.fullmatch(r'[a-z]+', k) or len(k) < 3 or k in STOP_EN: continue
        if k not in out: out.append(k)
    return out
def evidence_has_thread_keyword(evidence, texts):
    kws = [k for t in texts for k in thread_keywords(t)]
    if not kws: return True              # nothing to check against
    ev = norm(evidence)
    return any(contains(ev, k) for k in kws)

# --- counting over a run folder (the card list comes from the <known> block of the saved prompt) ---
def parse_known(prompt):
    block = prompt[prompt.index('<known>'):prompt.index('</known>')]
    cards = []
    for line in block.splitlines():
        m = re.match(r'- (.+?) \((.+)\)$', line)
        if not m: continue
        parts = [p.strip() for p in m.group(2).split(', ')]
        aliases = []
        for p in parts[1:]:
            m2 = re.match(r'(별칭|aliases): (.+)', p)
            if m2: aliases += [a.strip() for a in m2.group(2).split(',')]
        cards.append({'name': m.group(1), 'kind': 'character' if parts[0] in ('인물', 'character') else 'other', 'aliases': aliases})
    return cards

def count_run(path):
    j = json.load(open(glob.glob(path + '/calls/*chapter-extract.json')[0]))
    out = j['output'] if isinstance(j['output'], dict) else json.loads(j['output'])
    cards, weak_f = parse_known(j['prompt']), 0
    for f in out['facts']:
        names, kind = josa_forms(f['subjectName']), None
        card = next((c for form in names for c in cards if c['name'] == form or form in c['aliases']), None)
        if card: names, kind = [card['name']] + card['aliases'] + names, card['kind']
        else:
            e = next((e for e in out['entries'] if e['name'].strip() in names), None)
            if e: names, kind = names + e['aliases'], e['kind']
        if not evidence_names_subject(f['evidence'], names, kind): weak_f += 1
    weak_t = sum(1 for t in out['threads'] if not evidence_has_thread_keyword(t['evidence'], [t['title'], t['description']]))
    return len(out['facts']), weak_f, len(out['threads']), weak_t

if __name__ == '__main__':
    base = sys.argv[1].rstrip('/')
    runs = sys.argv[2:] or sorted(os.path.basename(p) for p in glob.glob(base + '/run-*') if glob.glob(p + '/calls/*chapter-extract.json'))
    tot = [0, 0, 0, 0]
    for r in runs:
        c = count_run(base + '/' + r)
        tot = [a + b for a, b in zip(tot, c)]
        print(f'{r}: facts {c[0]} weak {c[1]} | threads {c[2]} weak {c[3]}')
    print(f'TOTAL: facts {tot[0]} weak {tot[1]} | threads {tot[2]} weak {tot[3]}')
