import pandas as pd
from thefuzz import fuzz, process
import re

poly = pd.read_csv('polymarket_markets.csv')
kalshi = pd.read_csv('kalshi_markets.csv')

def get_poly_sub(title):
    if ' - ' in title:
        return title.split(' - ', 1)[1].strip()
    return title.strip()

poly['sub_title'] = poly['title'].apply(get_poly_sub)

# ─── CATEGORY-LEVEL MAPPINGS ──────────────────────────────────────────────────
# Maps poly category prefix (from parent title) → list of Kalshi market_id prefixes
category_map = {
    "F1 Drivers' Champion":             'KXF1-26-',
    "F1 Drivers' Champion":             'KXF1-26-',
    "F1 Constructors' Champion":        'KXF1CONSTRUCTORS-26-',
    "F1 Constructors' Champion":        'KXF1CONSTRUCTORS-26-',
    'English Premier League Winner':    'KXPREMIERLEAGUE-26-',
    'UEFA Champions League Winner':     'KXUCL-26-',
    '2026 FIFA World Cup Winner':       'KXMENWORLDCUP-26-',
    '2026 NBA Champion':                'KXNBA-26-',
    '2026 NHL Stanley Cup Champion':    'KXNHL-26-',
    'MLS Cup Winner 2026':              'KXMLSCUP-26-',
    '2026 PGA Championship Winner':     'KXPGATOUR-PGC26-',
    '2026 Men\'s French Open Winner':   'KXFOMEN-26-',
    'Nobel Peace Prize Winner 2026':    'KXNOBELPEACE-26-',
    'Measles cases in U.S. in 2026?':   'KXMEASLES-26-',
    'Next French Presidential Election':'KXFRENCHPRES-27-',
    '2026 Seoul Mayoral Election Winner':'KXSEOULMAYOR-26JUN03-',
    'Presidential Election Winner 2028':'KXPRESPERSON-28-',
    'Balance of Power: 2026 Midterms':  'KXBALANCEPOWERCOMBO-27FEB-',
    'Who will be the next Prime Minister of Israel after the next election?': 'KXISRAELPM-26OCT27-',
    '2026 Men\'s Australian Open Winner': 'KXAUSTOPEN-26-',
    'NBA MVP': 'KXNBAMVP-26-',
    'NBA Playoffs: Eastern Conference Champion': 'KXNBAEAST-26-',
    'NBA Playoffs:  Western Conference Champion': 'KXNBAWEST-26-',
}

# Get poly parent title (before " - ")
def get_poly_parent(title):
    if ' - ' in title:
        return title.split(' - ', 1)[0].strip()
    return title.strip()

poly['parent_title'] = poly['title'].apply(get_poly_parent)

# Build kalshi lookup: prefix → list of (market_id, title)
kalshi_by_prefix = {}
for _, row in kalshi.iterrows():
    mid = str(row['market_id'])
    for prefix in set(category_map.values()):
        if mid.startswith(prefix):
            kalshi_by_prefix.setdefault(prefix, [])
            kalshi_by_prefix[prefix].append((row['market_id'], row['title']))

# Normalize for name matching
def normalize(s):
    return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]', ' ', s.lower())).strip()

# ─── ADDITIONAL SINGLE MARKETS ───────────────────────────────────────────────
# Direct poly sub_title → single kalshi market_id+title mappings
single_matches = {
    # GTA VI
    'gta vi released before june 2026': ('GTA6-26MAY31', 'GTA 6 release date?'),
    # Congress balance of power (handled by group above too)
    # Stranger Things
    "new \"stranger things\" episode released by december 31?": ('KXMEDIARELEASEST-27JAN01', 'Will Stranger Things release a new episode this year?'),
    "new \"stranger things\" episode released by june 30?": ('KXMEDIARELEASEST-27JAN01', 'Will Stranger Things release a new episode this year?'),
    "new \"stranger things\" episode released by may 31?": ('KXMEDIARELEASEST-27JAN01', 'Will Stranger Things release a new episode this year?'),
    # Greenland
    "will trump acquire greenland before 2027?": ('KXGREENLAND-29-26MAY', 'Will Trump buy at least part of Greenland?'),
    "will the us acquire part of greenland in 2026?": ('KXGREENTERRITORY-29-26APR', 'Will the US take control of any part of Greenland?'),
    # Taiwan
    "will china invade taiwan by end of 2026?": ('KXTAIWANLVL4-26JUL01', 'Will the US issue a Level 4 travel advisory for Taiwan?'),
    "will china invade taiwan by june 30, 2026?": ('KXTAIWANLVL4-26JUL01', 'Will the US issue a Level 4 travel advisory for Taiwan?'),
    # US confirm aliens exist
    "will the us confirm that aliens exist by may 31?": ('KXUFOCONFIRM-27-Y', 'Will the U.S. confirm that aliens exist?'),
    "will the us confirm that aliens exist by june 30?": ('KXUFOCONFIRM-27-Y', 'Will the U.S. confirm that aliens exist?'),
    "will the us confirm that aliens exist by september 30?": ('KXUFOCONFIRM-27-Y', 'Will the U.S. confirm that aliens exist?'),
    "will the us confirm that aliens exist before 2027?": ('KXUFOCONFIRM-27-Y', 'Will the U.S. confirm that aliens exist?'),
    # Reza Pahlavi
    "will reza pahlavi be head of state in iran end of 2026?": ('KXPAHLAVIHEAD-27JAN-RPAH', 'Will Reza Pahlavi lead Iran in 2026?'),
    "will reza pahlavi enter iran by june 30?": ('KXPAHLAVIVISITA-27JAN01', 'Will Reza Pahlavi visit Iran in 2026?'),
    "will reza pahlavi enter iran by december 31?": ('KXPAHLAVIVISITA-27JAN01', 'Will Reza Pahlavi visit Iran in 2026?'),
    "will reza pahlavi enter iran by may 31?": ('KXPAHLAVIVISITA-27JAN01', 'Will Reza Pahlavi visit Iran in 2026?'),
    # Israel-Syria
    "israel x syria security agreement by june 30?": ('KXABRAHAMSY-29-JAN20', 'Will Israel and Syria normalize relations during Trump\'s term?'),
    "israel x syria security agreement by december 31?": ('KXABRAHAMSY-29-JAN20', 'Will Israel and Syria normalize relations during Trump\'s term?'),
    # Fed June decision
    "will there be no change in fed interest rates after the june 2026 meeting?": ('KXFEDDECISION-26JUN-C26', 'Fed decision in June 2026?'),
    "will the fed decrease interest rates by 25 bps after the june 2026 meeting?": ('KXFEDDECISION-26JUN-C26', 'Fed decision in June 2026?'),
    "will the fed increase interest rates by 25 bps after the june 2026 meeting?": ('KXFEDDECISION-26JUN-C26', 'Fed decision in June 2026?'),
    "will the fed decrease interest rates by 50+ bps after the june 2026 meeting?": ('KXFEDDECISION-26JUN-C26', 'Fed decision in June 2026?'),
    # Bitcoin
    "will bitcoin hit $150k by june 30, 2026?": ('KXBTCMAX150-25-26MAR31-149999.99', 'When will Bitcoin hit $150k?'),
    "will bitcoin hit $150k by december 31, 2026?": ('KXBTCMAX150-25-26MAR31-149999.99', 'When will Bitcoin hit $150k?'),
    "will bitcoin hit $150k by september 30?": ('KXBTCMAX150-25-26MAR31-149999.99', 'When will Bitcoin hit $150k?'),
    "will bitcoin hit $150k by march 31, 2026?": ('KXBTCMAX150-25-26MAR31-149999.99', 'When will Bitcoin hit $150k?'),
    # SpaceX IPO
    "spacex (space exploration technologies corp.) ipo before 2027?": ('KXIPOSPACEX-26APR01', 'When will SpaceX officially announce an IPO?'),
    # UK Next PM
    "will keir starmer be the next prime minister of the united kingdom?": ('KXNEXTUKPM-26-KSTA', 'Who will be the next Prime Minister of the UK?'),
    # US Iran nuclear deal
    "us x iran permanent peace deal by june 30, 2026?": ('KXUSAIRANAGREEMENT-27-26APR', 'US-Iran nuclear deal?'),
    "us x iran permanent peace deal by december 31, 2026?": ('KXUSAIRANAGREEMENT-27-26APR', 'US-Iran nuclear deal?'),
    "us x iran permanent peace deal by may 31, 2026?": ('KXUSAIRANAGREEMENT-27-26APR', 'US-Iran nuclear deal?'),
    # NBA MVP
    "will shai gilgeous-alexander win the 2025–2026 nba mvp?": ('KXNBAMVP-26-SGIA', 'NBA MVP?'),
    "will nikola jokic win the 2025–2026 nba mvp?": ('KXNBAMVP-26-NJOK', 'NBA MVP?'),
    "will victor wembanyama win the 2025–2026 nba mvp?": ('KXNBAMVP-26-VWEM', 'NBA MVP?'),
    # Carlos Alcaraz French Open
    "will carlos alcaraz win the 2026 men's french open?": ('KXFOMEN-26-ALC', "Men's French Open Winner"),
    "will jannik sinner win the 2026 men's french open?": ('KXFOMEN-26-SIN', "Men's French Open Winner"),
    "will novak djokovic win the 2026 men's french open?": ('KXFOMEN-26-DJO', "Men's French Open Winner"),
    "will alexander zverev win the 2026 men's french open?": ('KXFOMEN-26-ZVE', "Men's French Open Winner"),
}

# ─── NAME → KALSHI CODE MAPPINGS for group markets ───────────────────────────
# For each category prefix, map normalized player/team names to Kalshi suffix codes
name_to_code = {
    # F1 drivers
    'KXF1-26-': {
        'lando norris': 'LN', 'max verstappen': 'MV', 'charles leclerc': 'CL',
        'lewis hamilton': 'LH', 'oscar piastri': 'OP', 'george russell': 'GR',
        'kimi antonelli': 'KA', 'alexander albon': 'AL', 'fernando alonso': 'FA',
        'pierre gasly': 'PG', 'sergio pérez': 'SP', 'valtteri bottas': 'VB',
        'lance stroll': 'LS', 'esteban ocon': 'EO', 'nico hülkenberg': 'NH',
        'gabriel bortoleto': 'GB', 'carlos sainz jr': 'CS', 'franco colapinto': 'FC',
        'oliver bearman': 'OB', 'arvid lindblad': 'ARV', 'isack hadjar': 'IH',
        'liam lawson': 'LL',
    },
    # F1 constructors
    'KXF1CONSTRUCTORS-26-': {
        'red bull racing': 'RED', 'haas': 'HAA', 'audi': 'AUD', 'alpine': 'ALP',
        'mercedes': 'MER', 'racing bulls': 'RAC', 'williams': 'WIL',
        'ferrari': 'FER', 'aston martin': 'AST', 'cadillac': 'CAD', 'mclaren': 'MCL',
    },
    # EPL
    'KXPREMIERLEAGUE-26-': {
        'arsenal': 'ARS', 'liverpool': 'LFC', 'manchester city': 'MCI',
        'chelsea': 'CHE', 'newcastle': 'NEW', 'manchester united': 'MUN',
        'tottenham': 'TOT', 'aston villa': 'AVL', 'nottm forest': 'NFO',
        'nottingham forest': 'NFO', 'brighton': 'BRI', 'brentford': 'BRE',
        'crystal palace': 'CPL', 'everton': 'EVE', 'west ham': 'WHU',
        'fulham': 'FUL', 'wolves': 'WOL', 'bournemouth': 'BOU',
        'leeds': 'LEE', 'sunderland': 'SUN', 'burnley': 'BUR',
    },
    # UCL
    'KXUCL-26-': {
        'psg': 'PSG', 'arsenal': 'ARS', 'atalanta': 'ATA', 'atletico madrid': 'ATM',
        'barcelona': 'BAR', 'bayern munich': 'BMU', 'bodo glimt': 'BOG',
        'chelsea': 'CHE', 'galatasaray': 'GAL', 'bayer leverkusen': 'LEV',
        'leverkusen': 'LEV', 'liverpool': 'LFC', 'real madrid': 'RMA',
        'inter': 'INT', 'juventus': 'JUV', 'benfica': 'BEN',
        'sporting': 'SPO', 'dortmund': 'DOR', 'psg': 'PSG',
        'man city': 'MCI', 'napoli': 'NAP', 'club brugge': 'BOG',
    },
    # World Cup
    'KXMENWORLDCUP-26-': {
        'argentina': 'AR', 'brazil': 'BR', 'france': 'FR', 'germany': 'DE',
        'england': 'GB', 'spain': 'ES', 'portugal': 'PT', 'netherlands': 'NL',
        'italy': 'IT', 'uruguay': 'UY', 'japan': 'JP', 'usa': 'US',
        'mexico': 'MX', 'colombia': 'CO', 'morocco': 'MA', 'south korea': 'KR',
        'canada': 'CA', 'australia': 'AU', 'turkey': 'TR', 'turkiye': 'TR',
        'croatia': 'HR', 'senegal': 'SN', 'ecuador': 'EC', 'iran': 'IRN',
        'saudi arabia': 'SA', 'norway': 'NO', 'sweden': 'SE', 'new zealand': 'NZ',
        'south africa': 'ZA', 'ghana': 'GH', 'ivory coast': 'CI', 'egypt': 'EG',
        'algeria': 'DZ', 'morocco': 'MA', 'qatar': 'QA', 'paraguay': 'PY',
        'austria': 'AT', 'belgium': 'BE', 'curaçao': 'CW', 'haiti': 'HT',
        'scotland': 'SC', 'czechia': 'CZ', 'uzbekistan': 'UZ', 'jordan': 'JO',
        'tunisia': 'TN', 'cape verde': 'CV', 'iraq': 'IQ', 'switzerland': 'CH',
        'congo dr': 'CD', 'panama': 'PA', 'peru': 'PE', 'bolivia': 'BO',
        'bosnia-herzegovina': 'BA',
    },
    # NBA Finals
    'KXNBA-26-': {
        'atlanta hawks': 'ATL', 'boston celtics': 'BOS', 'brooklyn nets': 'BKN',
        'charlotte hornets': 'CHA', 'chicago bulls': 'CHI', 'cleveland cavaliers': 'CLE',
        'dallas mavericks': 'DAL', 'denver nuggets': 'DEN', 'detroit pistons': 'DET',
        'golden state warriors': 'GSW', 'houston rockets': 'HOU', 'indiana pacers': 'IND',
        'los angeles clippers': 'LAC', 'los angeles lakers': 'LAL', 'memphis grizzlies': 'MEM',
        'miami heat': 'MIA', 'milwaukee bucks': 'MIL', 'minnesota timberwolves': 'MIN',
        'new orleans pelicans': 'NOP', 'new york knicks': 'NYK', 'oklahoma city thunder': 'OKC',
        'orlando magic': 'ORL', 'philadelphia 76ers': 'PHI', 'phoenix suns': 'PHX',
        'portland trail blazers': 'POR', 'sacramento kings': 'SAC', 'san antonio spurs': 'SAS',
        'toronto raptors': 'TOR', 'utah jazz': 'UTA', 'washington wizards': 'WAS',
    },
    # NHL
    'KXNHL-26-': {
        'anaheim ducks': 'ANA', 'boston bruins': 'BOS', 'buffalo sabres': 'BUF',
        'calgary flames': 'CGY', 'carolina hurricanes': 'CAR', 'chicago blackhawks': 'CHI',
        'colorado avalanche': 'COL', 'columbus blue jackets': 'CBJ', 'dallas stars': 'DAL',
        'detroit red wings': 'DET', 'edmonton oilers': 'EDM', 'florida panthers': 'FLA',
        'los angeles kings': 'LAK', 'minnesota wild': 'MIN', 'montreal canadiens': 'MTL',
        'nashville predators': 'NSH', 'new jersey devils': 'NJD', 'new york islanders': 'NYI',
        'new york rangers': 'NYR', 'ottawa senators': 'OTT', 'philadelphia flyers': 'PHI',
        'pittsburgh penguins': 'PIT', 'san jose sharks': 'SJS', 'seattle kraken': 'SEA',
        'st. louis blues': 'STL', 'tampa bay lightning': 'TBL', 'toronto maple leafs': 'TOR',
        'utah mammoth': 'UTA', 'vancouver canucks': 'VAN', 'vegas golden knights': 'VGK',
        'washington capitals': 'WSH', 'winnipeg jets': 'WPG',
    },
    # MLS Cup
    'KXMLSCUP-26-': {
        'atlanta united fc': 'ATL', 'austin fc': 'ATX', 'charlotte fc': 'CLT',
        'chicago fire fc': 'CHI', 'colorado rapids': 'COL', 'columbus crew': 'CLB',
        'd.c. united': 'DC', 'fc cincinnati': 'CIN', 'fc dallas': 'DAL',
        'houston dynamo fc': 'HOU', 'inter miami cf': 'MIA', 'la galaxy': 'LAG',
        'los angeles fc': 'LAF', 'cf montréal': 'MTL', 'minnesota united fc': 'MIN',
        'nashville sc': 'NSH', 'new england revolution': 'NE', 'new york city fc': 'NYC',
        'new york red bulls': 'NY', 'orlando city sc': 'ORL', 'philadelphia union': 'PHI',
        'portland timbers': 'POR', 'real salt lake': 'RSL', 'san jose earthquakes': 'SJ',
        'san diego fc': 'SD', 'seattle sounders fc': 'SEA', 'sporting kansas city': 'SKC',
        'st. louis city sc': 'STL', 'toronto fc': 'TOR', 'vancouver whitecaps fc': 'VAN',
    },
    # Nobel Peace Prize
    'KXNOBELPEACE-26-': {
        'donald trump': 'DJT', 'volodymyr zelenskyy': 'VOL', 'greta thunberg': 'EUR',  # approximate
        'elon musk': 'ELO', 'donald trump': 'DJT', 'ahmed al-sharaa': 'CE',
        'vladimir putin': 'DOC',
    },
    # Measles (numeric suffix)
    'KXMEASLES-26-': {
        '500': '1500', '1000': '1500', '2000': '2000', '3000': '4000',
        '4000': '4000', '5000': '6000', '7500': '8000', '10000': '10000', '12500': '10000',
    },
    # 2028 US Presidential Election
    'KXPRESPERSON-28-': {
        'gavin newsom': 'GNEWS', 'alexandria ocasio-cortez': 'AOCA',
        'pete buttigieg': 'PBUT', 'josh shapiro': 'JSHA',
        'kamala harris': 'KHAR', 'wes moore': 'WMOO',
        'stephen smith': 'SSMI', 'gretchen whitmer': 'GWHI',
        'andy beshear': 'ABES', 'jb pritzker': 'JPRI',
    },
    # Israeli PM
    'KXISRAELPM-26OCT27-': {
        'benjamin netanyahu': 'BNET', 'benny gantz': 'BGAN',
        'yair lapid': 'YLAP', 'yair golan': 'YGOL',
        'gideon sa\'ar': 'GEIS', 'yariv levin': 'YLEV',
        'itamar ben gvir': 'ALIE', 'yossi cohen': 'YCOH',
        'gadi eizenkot': 'GEIZ',
    },
    # Seoul Mayor
    'KXSEOULMAYOR-26JUN03-': {
        'oh se-hoon': 'OSEH', 'chong won-oh': 'CWON', 'park ju-min': 'PJUM',
        'seo young-kyo': 'SYOU', 'kang hoon-sik': 'KMIN', 'na kyung-won': 'NKYU',
    },
    # French presidential
    'KXFRENCHPRES-27-': {
        'édouard philippe': 'EPHI', 'éric zemmour': 'EZEM', 'marine le pen': 'MLEP',
        'jordan bardella': 'JBAR', 'michel barnier': 'MBAR', 'xavier bertrand': 'XBER',
        'david lisnard': 'DLIS', 'valérie pécresse': 'VPEC', 'bruno retailleau': 'BRET',
        'laurent wauquiez': 'LWAU', 'raphaël glucksmann': 'RGLU', 'gérald darmanin': 'GDAR',
        'gabriel attal': 'GATL', 'marine tondelier': 'MTON', 'olivier faure': 'OFAU',
        'mathilde panot': 'MPAN', 'clémence guetté': 'CGUE', 'manuel bompard': 'MBOM',
        'jean-luc mélenchon': 'JMEL', 'sébastien lecornu': 'SLEC', 'yaël braun-pivet': 'YBRA',
        'ségolène royal': 'SROYA', 'carole delga': 'CDEL', 'élisabeth borne': 'EBOR',
        'jean castex': 'JCAS', 'dominique de villepin': 'DVIL', 'fabien roussel': 'FROU',
        'sarah knafo': 'SKNA', 'juan branco': 'JBRA', 'clémentine autain': 'CAUT',
        'bernard cazeneuve': 'BCAZ', 'nicolas dupont-aignan': 'NDAI', 'françois hollande': 'FHOL',
        'francois ruffin': 'FRUF', 'françois ruffin': 'FRUF', 'francois bayrou': 'FBAY',
        'françois bayrou': 'FBAY', 'david lisnard': 'DLIS',
    },
    # Balance of power
    'KXBALANCEPOWERCOMBO-27FEB-': {
        'd senate, d house': 'DD', 'r senate, r house': 'RR',
        'd senate, r house': 'DR', 'r senate, d house': 'RD',
        'other': 'OTHER',
    },
}

def extract_entity(sub_title, parent_title):
    """Extract the main entity (name/team) from a polymarket sub-title."""
    s = sub_title.lower()
    # Patterns: "Will X win/be..."
    m = re.match(r'will (.+?) (?:win|be) ', s)
    if m:
        return m.group(1).strip()
    m = re.match(r'will (.+?) (?:have|launch|ipo)', s)
    if m:
        return m.group(1).strip()
    return normalize(sub_title)

# ─── BUILD MATCHES ────────────────────────────────────────────────────────────
matches = []

for _, row in poly.iterrows():
    parent = row['parent_title'].strip().rstrip('?').strip()
    sub = row['sub_title']
    sub_norm = normalize(sub)
    matched = False

    # 1. Check single matches
    if sub_norm in single_matches:
        kid, ktitle = single_matches[sub_norm]
        matches.append({
            'polymarket_id': row['market_id'],
            'polymarket_title': sub,
            'kalshi_id': kid,
            'kalshi_title': ktitle,
            'match_type': 'single'
        })
        matched = True
        continue

    # 2. Check category mappings
    for poly_cat, kalshi_prefix in category_map.items():
        if poly_cat.lower() in parent.lower() or parent.lower() in poly_cat.lower():
            # Try to find individual name match
            entity = extract_entity(sub, parent)
            code = None
            
            if kalshi_prefix in name_to_code:
                nm = name_to_code[kalshi_prefix]
                if entity in nm:
                    code = nm[entity]
                else:
                    # Fuzzy match the entity against known names
                    best = process.extractOne(entity, list(nm.keys()), scorer=fuzz.token_sort_ratio)
                    if best and best[1] >= 85:
                        code = nm[best[0]]

            if code:
                full_id = kalshi_prefix + code
                # Find kalshi row with this market_id
                kr = kalshi[kalshi['market_id'] == full_id]
                if len(kr) > 0:
                    matches.append({
                        'polymarket_id': row['market_id'],
                        'polymarket_title': sub,
                        'kalshi_id': full_id,
                        'kalshi_title': kr.iloc[0]['title'],
                        'match_type': 'named'
                    })
                    matched = True
            
            if not matched:
                # Fallback: link to the first kalshi market with that prefix (group match)
                if kalshi_prefix in kalshi_by_prefix and len(kalshi_by_prefix[kalshi_prefix]) > 0:
                    # Use any representative market from that group
                    kid, ktitle = kalshi_by_prefix[kalshi_prefix][0]
                    matches.append({
                        'polymarket_id': row['market_id'],
                        'polymarket_title': sub,
                        'kalshi_id': kid,
                        'kalshi_title': ktitle,
                        'match_type': 'group'
                    })
                    matched = True
            break

df = pd.DataFrame(matches)
df = df.drop_duplicates(subset=['polymarket_id', 'kalshi_id'])
print(f"Total matches: {len(df)}")
print(f"Named: {len(df[df['match_type']=='named'])}")
print(f"Single: {len(df[df['match_type']=='single'])}")
print(f"Group: {len(df[df['match_type']=='group'])}")

# Save to CSV
out = df[['polymarket_id', 'polymarket_title', 'kalshi_id', 'kalshi_title', 'match_type']]
out.to_csv('matched_markets.csv', index=False)
print("\nSample named matches:")
print(df[df['match_type']=='named'][['polymarket_title', 'kalshi_id', 'kalshi_title']].head(20).to_string())
print("\nSample single matches:")
print(df[df['match_type']=='single'][['polymarket_title', 'kalshi_id', 'kalshi_title']].head(10).to_string())
