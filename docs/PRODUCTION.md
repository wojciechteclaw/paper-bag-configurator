# Torba klockowa (SOS / block-bottom bag) — wiedza produkcyjna i geometria

Dokument prowadzi agent `paper-bag-production-expert`. Opisuje, jak torba klockowa powstaje fizycznie,
i przekłada to na geometrię dla `src/domain` (czyste funkcje 2D) i `src/renderer` (animacja złożenia).
Kontekst: `docs/SPEC.md` (§2 zakres, §4a złożenie, §4b wykrój).

## 0. Legenda wiarygodności

Każda liczba i każde twierdzenie jest oznaczone:

| Znacznik | Znaczenie |
|---|---|
| **[K]** | Reguła klienta (zespół produkcyjny klienta). Wiążąca, nawet jeśli branża robi inaczej. |
| **[F]** | Fakt zweryfikowany w źródle (URL podany przy nim lub w §12). |
| **[W]** | Wyprowadzenie geometryczne z tego dokumentu (sprawdzalne rachunkiem, nie z literatury). |
| **[T]** | Wartość typowa w branży: kilka źródeł handlowych lub praktyka. Nie jest normą. |
| **[Z]** | Założenie robocze. Trzeba je potwierdzić z produkcją (patrz §11). |

Oznaczenia: `W` szerokość (przód/tył, dłuższa krawędź podstawy, tylko tu uchwyty), `D` głębokość
(fałdy boczne), `H` wysokość, `a` zapas na dno, `s` szerokość zakładki klejowej wzdłużnej. Wszystko w mm.

---

## 1. Anatomia torby i terminologia (PL / EN)

| PL | EN | Opis |
|---|---|---|
| ścianka przednia / tylna | front / back panel | Prostokąt `W × H`. Uchwyty i łatki są tylko tutaj [K]. |
| ścianka boczna, fałda boczna | side gusset | Prostokąt `D × H`. W stanie płaskim jest złożona do środka wzdłuż pionowego bigu środkowego. |
| big, linia bigowania | crease, score line | Linia, na której papier jest wstępnie zgnieciony, żeby giął się w tym miejscu. |
| rękaw | tube | Papier zwinięty w rurę `2(W+D)` i sklejony wzdłuż. Maszyna: tuber. |
| zakładka klejowa wzdłużna | longitudinal (side) seam, glue flap | Pas o szerokości `s` sklejający rękaw na całej długości. |
| dno klockowe (prostokątne) | block bottom, SOS / square bottom | Płaskie dno `W × D`, na którym torba stoi. Maszyna: bottomer. |
| zapas na dno | bottom allowance | Przedłużenie każdej ścianki poniżej linii dna, `a = (D+30)/2` [K]. Z niego powstaje dno. |
| linia dna | bottom fold line / primary cross fold | Obwodowy big `y = 0`, na którym ścianki przechodzą w dno. |
| klapa przednia / tylna dna | front / back bottom flap | Zapas pod FRONT / BACK (`W × a`). Kładzie się na dnie; klapy zachodzą na siebie. |
| zawinięcie boczne dna (trójkąt) | corner tuck, gusset tuck | Zapas pod ścianką boczną, złożony w trójkąt 45° (dolna połowa „rombu”). |
| „uszy” zawinięcia | ears, dog-ears | Części zapasu bocznego za liniami 45°. Są złożone na trójkąt i przyklejone do klap. |
| romb (karo) | diamond | Kwadrat obrócony o 45° na ściance bocznej i jej zapasie, o przekątnej `D` na linii dna. Jego górna połowa to trójkąt T na ściance. |
| zakładka klapy dna | bottom flap overlap | Pas, w którym klapa przednia zachodzi na tylną: **30 mm** (z reguły [K], patrz §3.4). |
| łata dna / wkładka | bottom patch / insert | Opcjonalne wzmocnienie dna (papier lub karton). Nie ma go w MVP [Z]. |
| big „płaskiego złożenia” | flat-fold pleat | Poziomy big na BACK i na tylnych połówkach boków, na wysokości `D/2` (patrz §3.5). |
| górna krawędź | top edge | Cięta prosto, ewentualnie ząbkowana (serrated). **Na razie bez zawinięcia górnego (top turn-in)**. To przyszły zakres. |
| łatka uchwytu | handle patch | Pasek papieru przyklejony od wewnątrz, który trzyma końce uchwytu [K]. |
| uchwyt skręcany / płaski | twisted / flat paper handle | Sznurek z papieru skręcanego albo płaska taśma papierowa. |

---

## 2. Proces produkcji (linia tuber + bottomer)

Linia do toreb klockowych ma dwa moduły: **tuber** formuje rękaw, **bottomer** zakłada dno. Do tego
dochodzi opcjonalny moduł uchwytów. Przykłady: Garant (grupa W&H) TRIUMPH, Newlong seria T + TH [F].

1. **Rola papieru** (reel): kraft biały lub brązowy, 40–100 g/m² [F Promar].
2. **Nadruk**: fleksografia, maks. 8 kolorów Pantone [F Promar]. Dwie drogi: druk inline przed tuberem
   (zwykle mniej zespołów drukujących) albo osobna maszyna CI-flexo i rola zadrukowana wcześniej.
   Dla 8 kolorów bardziej prawdopodobna jest druga droga [T/Z]. Druk idzie w sposób ciągły po wstędze,
   więc grafika przechodzi przez bigi (§4).
3. **Bigowanie wzdłużne i formowanie rękawa z fałdami** (tube forming, gusseting): wstęga jest składana
   w płaski rękaw. Boki wchodzą do środka na głębokość `D/2` każdy. Powstają bigi krawędzi rękawa i bigi
   środkowe fałd [F ogólnie; W&H/Garant „bag width / bottom width”].
4. **Klejenie wzdłużne** (longitudinal seam): zakładka `s` jest klejona klejem skrobiowym lub PVAc [T].
5. **Cięcie na długość** (cut-off): odcinek `L = H + a` [K]. Cięcie proste albo ząbkowane. Maszyny podają
   zakres długości odcinka („cut-off length”), patrz tabela w §3.6 [F].
6. **Dno (bottomer)**. Kolejność (patent US 6 623 162 [F] i praktyka [T]):
   1. Bigowanie poprzeczne linii dna i przekątnych 45° na końcu rękawa.
   2. **Otwarcie końca rękawa** (bottom opening): górna warstwa jest odciągana. Końce fałd bocznych
      wciskają się do środka jako trójkąty (corner tucks). Na płaszczyźnie powstaje prostokątny otwór
      `W × D` z dwiema klapami: przednią i tylną („the perimeter of the opening … defines a regular
      rectangle”, US 6 623 162).
   3. **Nałożenie kleju** na strefy klap wokół otworu.
   4. **Złożenie klapy tylnej**, potem **klapy przedniej na tylną** i ich sklejenie („back flap 58 is folded
      … then front flap 56 is folded … over the already-folded-over back flap … and is glued to the
      outer-facing surface of the back flap”, US 6 623 162).
   5. Opcjonalna łata dna.
   6. Gotowe dno leży płasko na ściance rękawa. Torba opuszcza maszynę **złożona na płasko**,
      z dnem przyłożonym do jednej ze ścianek (§3.5).
7. **Uchwyty** (moduł inline albo offline): skręcany sznurek lub płaska taśma. Oba typy są wklejane
   od wewnątrz łatką przy górnej krawędzi [K]. Maszyny z uchwytem skręcanym zaczynają się zwykle od
   szerokości ok. 180 mm (Garant TRIUMPH 5 QT/SK: 180–460 mm [F, wynik wyszukiwania, do weryfikacji]).
8. **Liczenie, stosowanie, pakowanie** w karton lub folię [F Promar].

---

## 3. Geometria

### 3.1 Układy współrzędnych

**Panel-local** (każda ścianka oglądana z zewnątrz): początek w lewym dolnym rogu, `x` w prawo, `y` w górę.

| Panel | Wymiar | `x = 0` przy krawędzi… |
|---|---|---|
| FRONT | `W × H` | z LEFT |
| RIGHT | `D × H` | z FRONT |
| BACK | `W × H` | z RIGHT |
| LEFT | `D × H` | z BACK |
| BOTTOM | `W × D` | oglądane z dołu. `x` rośnie jak `x` przodu (od LEFT do RIGHT), `y` rośnie od bigu tylnego (`y=0`) do bigu przedniego (`y=D`) |

Przy takich osiach kolejność FRONT → RIGHT → BACK → LEFT to kolejne panele obwodu oglądanego z zewnątrz,
a lokalne `x` każdego panelu zgadza się z osią X arkusza (§10). Upraszcza to UV i wykrój.

**Świat 3D** (tylko do opisu animacji, mm): `x` w prawo (0…W wzdłuż przodu), `y` w górę, `z` do widza.
Płaszczyzna FRONT: `z = 0` (FRONT jest nieruchomy). BACK w stanie stojącym: `z = −D`.

### 3.2 Rękaw i arkusz

| Wielkość | Wzór | Źródło |
|---|---|---|
| obwód rękawa | `2·(W + D)` | [W] |
| szerokość arkusza | `2·(W + D) + s` | [W] |
| zapas na dno pod każdą ścianką | `a = (D + 30) / 2 = D/2 + 15` | **[K]** |
| wysokość arkusza (długość odcinka) | `L = H + a = H + (D + 30)/2` | **[K]** |
| zakładka klap dna | `2a − D = 30 mm` | [W z K] |
| szerokość zakładki wzdłużnej `s` | **10 mm**; szew na krawędzi BACK/LEFT (§9.1) | **[K]** (29.09.2026) |

**Co znaczy 30 mm.** Klapa przednia i tylna mają po `a = D/2 + 15`. Każda kładzie się na dnie od swojej
krawędzi, więc sięga 15 mm za środek dna (`D/2`). Razem zachodzą na siebie na **30 mm**. To jest pas kleju,
który zamyka dno. Wynika to wprost z geometrii [W], a klient potwierdził samą regułę [K]. Pytanie z §11 dotyczy
tylko tego, czy dno ma dodatkowe łaty lub strefy kleju.

> Uwaga [T]: w szablonach toreb robionych ręcznie spotyka się „połowa fałdy + 15…25 mm”. Reguła klienta
> (+15 mm na klapę) mieści się w tym zakresie. **Obowiązuje wartość klienta.**

### 3.3 Fałda boczna: bigi i dlaczego `D/2`

Ścianka LEFT oglądana z zewnątrz. RIGHT jest lustrem względem pionowej osi: połówka tylna jest po prawej.

```text
         u=0 (krawędź z BACK)            u=D (krawędź z FRONT)
  v=H    ┌────────────────┬───────────────┐
         │                ┆               │
         │  SIDE_BACK_    ┆  SIDE_FRONT   │   ┆  big środkowy u = D/2, v ∈ [D/2, H]
         │  UPPER         ┆               │      (dolina, składa się do środka torby)
         │                ┆               │
  v=D/2  ├════════════════A               │   ═  big poziomy „płaskiego złożenia”
         │ SIDE_BACK_   /   \             │      tylko na połówce tylnej: (0,D/2)–(D/2,D/2)
         │ LOWER      /       \           │   /  big 45°: (0,0)–(D/2,D/2)
         │          /    T      \         │   \  big 45°: (D,0)–(D/2,D/2)
         │        /               \       │   A  wierzchołek (D/2, D/2)
         │      /                   \     │
         │    /                       \   │
         │  /                           \ │
  v=0    └────────────────────────────────┘   ─  linia dna (big obwodowy) = podstawa trójkąta T
```

- **Linie 45° z dolnych narożników** są dwusiecznymi kątów prostych w rogach dna. Spotykają się nad
  środkiem krawędzi dna na wysokości `D/2`, bo trójkąt prostokątny równoramienny o przeciwprostokątnej
  `D` ma wysokość `D/2` [W]. Pod linią dna, na zapasie bocznym, jest ten sam trójkąt odwrócony (§3.4).
  Oba trójkąty razem tworzą **romb (kwadrat obrócony o 45°) o przekątnych `D`**. To klasyczny „romb”
  dna klockowego.
- **Dlaczego potrzebny jest big poziomy na połówce tylnej.** Bez niego w wierzchołku A schodzą się 3 bigi
  (pionowy + dwa 45°). Wierzchołek o nieparzystej liczbie bigów nie składa się na płasko
  (tw. Maekawy: liczba bigów w wierzchołku płasko-składalnym jest parzysta). Z bigiem poziomym A ma
  4 bigi o kątach sektorów 90°, 45°, 90°, 135°. Sumy kątów naprzemiennych dają 180° + 180°, więc
  tw. Kawasakiego jest spełnione [W]. Dokładnie taki wierzchołek „side vertex (90°, 135°, 90°, 45°)”
  opisują Balkcom, Demaine i in. dla tradycyjnej torby [F]. Ich rys. 1 pokazuje też big poziomy na
  ściance tylnej. **Wniosek: szkic w SPEC §4a trzeba uzupełnić o big poziomy `v = D/2` na połówce
  tylnej każdego boku i na całej szerokości BACK.**
- Warunek: `H > D/2`, inaczej linie 45° nie spotkają się na ściance [F Balkcom].

### 3.4 Dno: formowanie z końca rękawa (priorytet klienta)

**„Na dole również tworzy się zawinięcie”.** Każda z czterech ścianek ma pod linią dna zapas
`a = D/2 + 15`. Z tych czterech zapasów składa się dno.

#### 3.4.1 Bigi na zapasie (pod linią dna, `t` = odległość w dół od linii dna, `t ∈ [0, a]`)

| Zapas | Bigi | Źródło |
|---|---|---|
| pod FRONT (`W × a`) | tylko linia dna `t = 0` (zawias 90°). Cała klapa jest sztywna. | [W], US 6 623 162 |
| pod BACK (`W × a`) | tylko linia dna `t = 0` | j.w. |
| pod LEFT / RIGHT (`D × a`) | dwie linie 45°: od `(0, 0)` i `(D, 0)` do `(D/2, t = D/2)` (dolna połowa rombu), plus big środkowy `u = D/2` dla `t ∈ [D/2, a]` (kontynuacja bigu fałdy z tubera) | [W], US 6 623 162 („diagonal fold lines”) |

Regiony zapasu bocznego:

- **trójkąt wewnętrzny** (inner tuck triangle): `(0,0), (D,0), (D/2, D/2)`,
- **ucho tylne**: `(0,0), (D/2,D/2), (D/2,a), (0,a)`,
- **ucho przednie**: `(D,0), (D,a), (D/2,a), (D/2,D/2)`.

Tu `u` mierzone jak na panelu (LEFT: od BACK). Uszy stykają się wzdłuż bigu środkowego poniżej rombu
(odcinek o długości `a − D/2 = 15 mm`).

#### 3.4.2 Kolejność składania i warstwy (widok od spodu, współrzędne BOTTOM)

```text
 1) zapas otwarty (rękaw stoi,           2) boki do środka: trójkąty wewn. leżą w dnie,
    zapasy wiszą w dół)                     uszy odwinięte o 180° po liniach 45° na trójkąt

   ┌───────────── W ─────────────┐        y=D ┌───────────────────────────────┐ (big przedni)
   │      zapas FRONT  W × a     │            │\ ucho P.                ucho P./│
   └─────────────────────────────┘            │  \                         /  │
   zapas LEFT  D×a     zapas RIGHT D×a        │ Tw  >  A            A  <  Tw  │ Tw = trójkąt wewn.
   ┌─────────────────────────────┐            │  /                         \  │
   │      zapas BACK   W × a     │            │/ ucho T.                ucho T.\│
   └─────────────────────────────┘        y=0 └───────────────────────────────┘ (big tylny)

 3) klapa tylna (W × a) na dno:            4) klapa przednia (W × a) na klapę tylną, klej:
    y ∈ [0, a] = [0, D/2+15]                   y ∈ [D−a, D] = [D/2−15, D]

   y=D ┌───────────────────────────────┐    y=D ┌───────────────────────────────┐
       │  (trójkąty/uszy widoczne)     │        │ KLAPA PRZEDNIA (wierzch)      │
 D/2+15├───────────────────────────────┤        │                               │
       │ KLAPA TYLNA                   │ D/2−15 ├═══════ krawędź klapy, widoczny szew ══┤
       │                               │        │ klapa tylna (widoczna część)  │
   y=0 └───────────────────────────────┘    y=0 └───────────────────────────────┘
                                             zakładka klejowa: y ∈ [D/2−15, D/2+15] = 30 mm
```

Kolejność warstw od wnętrza torby na zewnątrz [W + US 6 623 162 dla kolejności klap]:

1. **Trójkąty wewnętrzne** zapasów bocznych. Są przedłużeniem ścianek bocznych, obrócone o 90° do środka
   na linii dna. To one są widoczne od środka torby przy krótkich krawędziach dna. Wierzchołki: LEFT
   `(0,0), (0,D), (D/2, D/2)` w układzie BOTTOM, RIGHT to lustro `x → W − x`.
2. **Uszy**, odwinięte o 180° po liniach 45° i leżące pod trójkątem wewnętrznym. Ucho tylne LEFT zajmuje
   `(0,0), (0,a), (D/2,a), (D/2,D/2)`, ucho przednie LEFT `(0,D), (0,D−a), (D/2,D−a), (D/2,D/2)` [W].
   Krawędź ucha, która była narożnikiem rękawa, ląduje na krótkiej krawędzi dna (`x = 0`), dokładnie
   pod krawędzią klapy. Dlatego nic nie wystaje poza obrys `W × D`.
3. **Klapa tylna** `W × a`, pas `y ∈ [0, a]`.
4. **Klapa przednia** `W × a`, pas `y ∈ [D − a, D]`, na wierzchu. Klej w pasie zakładki 30 mm
   i na stykach klap z uszami [T].

Wnioski geometryczne [W]:

- Trójkąty wewnętrzne LEFT i RIGHT mają wierzchołki w `x = D/2` i `x = W − D/2`. Nie nachodzą na siebie
  tylko wtedy, gdy **`D ≤ W`**. To fizyczne uzasadnienie reguły klienta. Przy `D = W` wierzchołki się
  stykają.
- Zapas zużyty na dno: `a` z każdej ścianki. Pole papieru dna: `2·W·a + 2·D·a`, a pole dna to `W·D`.
  Różnica to podwójne i potrójne warstwy (uszy, zakładka).
- Od zewnątrz widać jedną linię: krawędź klapy przedniej w `y = D/2 − 15` (BOTTOM-local). Obrys
  trójkątów może lekko przebijać przez papier (embossing) jako subtelny detal renderu [Z].

#### 3.4.3 Bigi na dolnych częściach czterech ścianek (nad linią dna)

| Ścianka | Bigi w strefie `y < D` | Rola |
|---|---|---|
| FRONT | tylko linia dna `y = 0` (zawias z dnem) | W stanie płaskim FRONT jest najniżej, a dno obraca się na tym bigu (§3.5). |
| BACK | linia dna `y = 0` **oraz big poziomy `y = D/2` na całej szerokości** | Pas `y ∈ [0, D/2]` składa się przy spłaszczaniu na zewnątrz i do góry, pod dno. |
| LEFT / RIGHT | linia dna, 45° do A, poziomy `v = D/2` na połówce tylnej, pionowy środkowy od A w górę | §3.3 |

### 3.5 Torba złożona na płasko: gdzie leży dno

Położenie końcowe (p = 1) z rachunku [W], zgodne z opisem wierzchołków u Balkcoma [F]:

- **FRONT** leży płasko i nie zmienia położenia. Jego linia dna jest **najniższą krawędzią** płaskiej torby.
- **Dno** obraca się o 90° na **przednim** bigu dna i leży płasko **na zewnętrznej stronie BACK**.
  Zajmuje pas `y ∈ [0, D]`. Jego tylna krawędź (big tylny) jest na wysokości `y = D`.
- **BACK** jest złożony w „Z”. Górna część (`y ≥ D/2`) leży płasko za przodem. Dolny pas `D/2` jest
  obrócony o 180° na bigu `y = D/2` na zewnątrz i do góry, między BACK a dnem, i sięga do `y = D`,
  gdzie przechodzi w dno.
- **Boki**: SIDE_FRONT i SIDE_BACK_UPPER składają się do środka na bigu środkowym (klasyczna fałda,
  `θ = 90°`). Trójkąt T kładzie się podstawą wzdłuż bocznej krawędzi płaskiej torby (`x = 0`,
  `y ∈ [0, D]`) z wierzchołkiem A w `(D/2, D/2)`. SIDE_BACK_LOWER leży pod T.
- Obie górne krawędzie są na wysokości `H`, więc góra jest równa. Z przodu płaska torba ma czysty FRONT
  na całej wysokości. Z tyłu widać dno (`W × D`) z szwem klap, a nad nim BACK.

> **Korekta SPEC §4a.** Sformułowanie „dno obraca się na tylnej dolnej krawędzi i kładzie płasko na
> tylnej ściance” jest w połowie trafne. Dno rzeczywiście kończy **na BACK**, ale zawiasem, który zostaje
> na dole, jest **przedni** big dna. Big tylny wędruje do `y = D` dzięki pasowi BACK złożonemu na `D/2`.
> Przy obrocie na tylnej krawędzi przód musiałby się przesunąć o `D` w pionie. Wtedy krawędzie górne
> nie byłyby równe albo dno musiałoby się zgiąć w połowie (to byłoby dno typu „satchel”) [W].
>
> **Fakt [F]:** tej torby nie da się złożyć sztywno (rigid origami) na tradycyjnym wzorze bigów.
> W rzeczywistości papier lekko się ugina (Balkcom i in., Twierdzenie 1). Animacja w §10.5 jest więc
> przybliżeniem: wszystkie duże panele są sztywne, a jedynie dolne trójkąty boków odkształcają się.

### 3.6 Ograniczenia wymiarów

| Reguła | Wartość | Źródło |
|---|---|---|
| krok wymiaru | 5 mm | [K] |
| szerokość W | 75–260 mm | [F Promar] |
| wysokość H | 170–430 mm | [F Promar] |
| `D ≤ W` | twarda reguła | [K], uzasadnienie w §3.4.2 [W] |
| `H > D/2` | twarde minimum geometryczne | [F Balkcom] |
| `D ≤ H` | zalecana (dno na płasko nie wystaje ponad torbę i nie zasłania łatki uchwytu na BACK) | [W], do potwierdzenia |
| `D ≈ 0,55–0,65·W` maks. na typowych maszynach | ostrzeżenie, nie błąd | [F dane maszyn poniżej] |
| D min | ok. 40 mm | [F Garant] |

Zakresy maszyn Garant/W&H (bag width / bottom width = D / cut-off = `H + a`) [F]:

| Maszyna | W | D | cut-off |
|---|---|---|---|
| TRIUMPH S | 60–120 | 40–80 | 180–310 |
| TRIUMPH 2B | 70–230 | 40–140 | 200–470 |
| TRIUMPH 2-T8 | 80–280 | 50–170 | 250–550 |
| TRIUMPH 3 MR | 105–320 | 55–180 | 240–650 |
| TRIUMPH 5-F6 | 180–460 | 70–255 | 320–770 |

Zakres klienta (W 75–260, H 170–430) odpowiada klasie TRIUMPH 2B / 2-T8. Wynika z tego, że **D** realnie
mieści się w **40–170 mm**, a nie w 40–300 mm z SPEC. Przykład z maksimum: `H = 430`, `D = 170` daje
`cut-off = 430 + 100 = 530 mm` ≤ 550, więc się mieści. Newlong (np. 1546TS + 538HS: W 180–460, D 80–220,
długość 265–590) ma podobne proporcje [T, ogłoszenia maszyn używanych].

---

## 4. Nadruk i grafika

- **Obszar zadruku to cała wstęga.** Grafika idzie w sposób ciągły przez wszystkie bigi pionowe. Na
  bokach łamie się na bigu środkowym i na liniach 45°, na BACK na bigu `D/2`, co widać tylko po
  złożeniu [W].
- **Co znika albo zmienia rolę**:
  - zapas pod FRONT (`y ∈ [−a, 0]`) jest w całości widoczny od spodu jako zewnętrzna klapa dna,
  - zapas pod BACK jest widoczny od spodu tylko w pasie `D/2 − 15` przy bigu tylnym,
  - zapasy pod bokami są całkowicie schowane,
  - zakładka `s` jest schowana (klej).
- **Na bokach** treść krytyczną trzymać powyżej rombu, czyli `v ≥ D/2 + 5 mm` [Z]. Obszar trójkąta T
  w torbie stojącej jest widoczny, ale leży na zawinięciu.
- **Spad** (bleed): 3 mm poza linię cięcia góry i końca rękawa, 2–3 mm zachodzenia koloru przez big na
  sąsiednią ściankę, gdy ścianki mają różne grafiki [T]. Źródło handlowe podaje ≥ 1/16" (1,6 mm) przez
  big i 1/4" (6 mm) odsunięcia od linii cięcia i dna [F goodstartpackaging].
- **Strefa bezpieczna** (safety): 6 mm od górnej krawędzi i od linii dna, 5 mm od bigów pionowych
  i od szwu wzdłużnego [T/Z].
- **Pasowanie** (registration): kolor do koloru we fleksografii ok. 0,2–0,5 mm [F ketegroup]. Nadruk
  względem bigów i cięcia na linii torbowej ok. ±1–2 mm [Z]. Dlatego krawędzie grafiki nie powinny
  wypadać dokładnie na bigach.
- **Fleksografia**: do 8 kolorów Pantone [F Promar]. Minimalne linie i tekst (dla druku inline)
  ok. 2 pt linia pozytyw, 3 pt negatyw, trapping 1/16" [F goodstartpackaging, dla druku inline 3 kol.].
  Na brązowym krafcie farby są transparentne i kolory ciemnieją [T].

---

## 5. Uchwyty

| Parametr | Skręcany (TWISTED_PAPER) | Płaski (FLAT_PAPER) | Źródło |
|---|---|---|---|
| przekrój | sznurek Ø 3–5 mm (podgląd: 5 mm) | taśma **20 mm** | [T] paperbagline, cxgiae / **[K]** płaski |
| długość sznurka | 340–460 mm | — | [T] paperbagline |
| rozstaw końców (jeden uchwyt) | **80 mm, stały** (niezależny od W) | **80 mm, stały** | **[K]** |
| wysokość pętli nad krawędzią | wynika z długości pętli (180 mm → ok. 72 mm przy rozstawie 80) | j.w. | [Z] |
| łatka (pasek mocujący) | **100 × 20 mm** (szer. × wys.) | **100 × 20 mm** | **[K]** |
| papier łatki | 80–120 g/m² kraft | j.w. | [Z] |
| pozycja łatki | od wewnątrz FRONT i BACK, wyśrodkowana (`x = W/2`), górna krawędź łatki **20 mm** pod górną krawędzią → `y ∈ [H − 40, H − 20]` | j.w. | **[K]** |

- Uchwyty są tylko na FRONT/BACK [K]. Bez zawinięcia górnego łatka jest klejona 20 mm pod krawędzią
  cięcia [K]. W typowej torbie z uchwytem łatkę zakrywa zawinięcie. Brak zawinięcia to decyzja
  klienta i trzeba ją potwierdzić ze względu na wytrzymałość (§11).
- Końce uchwytu (oba typy) biegną pionowo w dół na `x = W/2 ± 40` i kończą się pod łatką, 5 mm nad jej dolną
  krawędzią [Z]. Taśma płaska 20 mm przy rozstawie 80 mm zajmuje `|x − W/2| ∈ [30, 50]`, czyli dokładnie szerokość
  łatki 100 mm, więc nie ma miejsca na stopki zagięte na zewnątrz — końce taśmy są proste, bez stopek [Z].
- Zabezpieczenie wąskich ścianek [Z]: łatka zachowuje 5 mm od bocznych bigów (szerokość `min(100, W − 10)`, dotyczy
  W < 110). Gdy łatka jest węższa niż rozstaw + szerokość uchwytu (sznurek: W < 95, taśma: W < 110; W min = 75),
  rozstaw jest zmniejszany do `łatka − szerokość uchwytu` (krawędzie końców równo z bokami łatki), a układ ma flagę
  `endSpacingReduced` (`src/domain/geometry/handles.ts`). Dla W < ok. 180 mm maszyny z uchwytem skręcanym zwykle nie
  pracują (Garant QT/SK od 180 mm). **Do potwierdzenia: minimalne W dla uchwytów** (§11).
- EN 13590: bada nośność przez wielokrotne podnoszenie torby napełnionej obciążeniem zależnym od
  objętości [F]. Wytyczna CEPI Eurokraft / EUROSAC: dobra torba z uchwytami udźwignie co najmniej 6 kg
  i posłuży do 5 razy [F]. To dotyczy certyfikacji, nie geometrii.

---

## 6. Materiały (dla renderera)

| | Kraft biały (bielony) | Kraft brązowy (niebielony) |
|---|---|---|
| kolor bazowy (sRGB, orientacyjnie) [Z] | `#F4F1EA` | `#B8875A` … `#A97C50` |
| powierzchnia | gładsza, delikatna faktura | widoczne włókna, lekko nakrapiana |
| PBR [Z] | roughness 0,85, metalness 0 | roughness 0,9, metalness 0 |
| wpływ na druk | kolory wierne | farby ciemnieją, biel wymaga podkładu [T] |

- **Gramatura 40–100 g/m²** [F]. Grubość ≈ 0,06–0,13 mm (kraft ok. 1,2–1,4 µm na g/m²) [T].
- **Sztywność** rośnie z sześcianem grubości [T fizyka płyt]. 40–60 g/m²: ścianki lekko się wybrzuszają,
  bigi są miękkie. 80–100 g/m²: ostre krawędzie, typowe dla toreb z uchwytem [T/Z]. Renderer może skalować
  subtelne wybrzuszenie ścianek i szerokość zaokrąglenia na bigach w funkcji gramatury (opcjonalnie).
- Bigi rysować jako ciemniejsze linie o szerokości ok. 0,5–1 mm. Na krafcie brązowym bigi są jaśniejsze
  na grzbiecie [Z].

---

## 7. Normy

- **EN 13590:2003**: „Packaging. Flexible carrier bags for the transport of various retail goods. General
  characteristics and test methods for the determination of volume and carrying capacity” [F]. Dotyczy
  toreb z uchwytami: określa objętość nominalną i nośność. Nie definiuje geometrii dna.
- Kontakt z żywnością i FSC®: deklaracje producenta [F Promar]. Poza zakresem geometrii.

---

## 8. Przyszłe rozszerzenia (poza zakresem)

- **Zawinięcie górnej krawędzi** (top turn-in, zwykle 30–50 mm do środka [T]): dojdzie do wysokości
  arkusza (`L = H + a + turnIn`), zakryje łatki uchwytów i doda warstwę przy górze. Teraz: **brak**.
- Krawędź ząbkowana (serrated), wycięcie na kciuk (thumb notch), łata dna, dno z kartonem.
- Torba fałdowa (FOLDED) bez dna klockowego.

---

## 9. Wykrój — parametry (dieline, SPEC §4b)

### 9.1 Kolejność paneli i szew

**Decyzja klienta [K] (29.09.2026): szew wzdłużny leży na krawędzi rękawa między BACK a LEFT**, a zakładka
klejowa ma **10 mm**. BACK jest na wykroju jednym, niepodzielonym panelem.
Arkusz (strona zadrukowana = zewnętrzna, widok od strony druku), oś X od lewej:

| Segment | X od | X do | Szer. | Zawartość (panel-local x) |
|---|---|---|---|---|
| LEFT | 0 | D | D | LEFT `x ∈ [0, D]`; `x = 0` to krawędź od strony BACK = wolna krawędź arkusza (szew) |
| FRONT | D | W + D | W | FRONT `x ∈ [0, W]` |
| RIGHT | W + D | W + 2D | D | RIGHT `x ∈ [0, D]` |
| BACK | W + 2D | 2W + 2D | W | BACK `x ∈ [0, W]`; `x = W` to krawędź BACK/LEFT |
| zakładka GLUE | 2W + 2D | 2W + 2D + s | s = 10 | doczepiona do zewnętrznej krawędzi BACK (big C3), klejona do wolnej krawędzi LEFT |

Lokalne `x` każdego panelu (widok z zewnątrz, §3.1) rośnie zgodnie z osią X arkusza, więc obwód
LEFT → FRONT → RIGHT → BACK jest ciągły, a „tylne” połówki boków (przylegające do BACK) to:
LEFT `x ∈ [0, D/2]` (początek arkusza) i RIGHT `x ∈ [D/2, D]` (przy BACK). Zgodne z mapowaniem 3D:
FRONT +Z, BACK −Z, LEFT −X, RIGHT +X.

**Sposób zamknięcia rękawa [Z, typowe w branży]:** zakładka zagina się na C3 do środka rękawa (C3 staje się
krawędzią rękawa BACK/LEFT, 90°) i jest klejona **od wewnątrz pod wolną krawędź LEFT** (LEFT zachodzi na
zakładkę od zewnątrz, na pasie LEFT `x ∈ [0, s]`). Od zewnątrz widać tylko krawędź papieru LEFT na narożniku,
zakładka jest niewidoczna i niezadrukowana. Oś Y: `Y = 0` to linia dna, `Y ∈ [−a, H]`.

Konsekwencje szwu na krawędzi (a nie na płaskiej ściance) [W]:
- zakładka leży na tylnej połówce LEFT, więc składa się razem z nią: przechodzą przez nią big C8 (`Y = D/2`)
  oraz ukośne bigi rombu C6/C7 LEFT (odcinki `(2W+2D, 0)–(2W+2D+s, ±s)`), a na zapasie dna trafia w trójkąt
  wewnętrzny / ucho LEFT (podwójna warstwa w dnie);
- warunek `s < D/2` (zakładka nie może sięgać środkowego bigu fałdy C4). Przy `D ≥ 40` mm i `s = 10` spełniony.

### 9.2 Zakładka wzdłużna

`s = 10 mm` **[K]** (decyzja klienta, 29.09.2026), stała w `productionRules.ts` (`glueFlapWidth`).
Opcjonalne ścięcie 45° narożników zakładki na długości `a` przy końcu dna, żeby ograniczyć grubość w dnie [Z].

### 9.3 Linie cięcia i bigowania

`Xc_L = D/2`, `Xc_R = W + 3D/2` (środki boków), `X_T = 2W + 2D` (zawias zakładki), `a = (D+30)/2`.

**Cięcie (CUT):**

1. Obrys prostokąta `X ∈ [0, 2W+2D+s]`, `Y ∈ [−a, H]`. Góra: prosto (opcjonalnie ząbkowana w przyszłości).
   Dół (koniec rękawa): prosto.
2. **Brak nacięć klap dna.** Dno klockowe z rękawa powstaje wyłącznie przez składanie. Nacięcia
   z patentów US 5 518 316 i US 5 520 464 dotyczą wariantów zgrzewanych [F]. Opcjonalne ścięcie
   narożników zakładki `s` (§9.2).

**Bigi (CREASE):**

| # | Linia | Odcinek(i) | Typ w torbie stojącej |
|---|---|---|---|
| C1 | linia dna | `Y = 0`, `X ∈ [0, 2W+2D+s]` | 90° (ścianka–dno) |
| C2 | krawędzie rękawa | `X ∈ {D, W+D, W+2D}` (LEFT/FRONT, FRONT/RIGHT, RIGHT/BACK), `Y ∈ [−a, H]` | 90° (grzbiet) |
| C3 | zawias zakładki = krawędź BACK/LEFT | `X = X_T`, `Y ∈ [−a, H]` | 90° (grzbiet; zakładka pod LEFT od wewnątrz) |
| C4 | środek fałdy (ścianka) | `X ∈ {Xc_L, Xc_R}`, `Y ∈ [D/2, H]` | 0° na stojąco, 180° na płasko (dolina) |
| C5 | środek fałdy (zapas) | `X ∈ {Xc_L, Xc_R}`, `Y ∈ [−a, −D/2]` | między uszami |
| C6 | romb, górne 45° | `(Xc−D/2, 0)–(Xc, D/2)` i `(Xc+D/2, 0)–(Xc, D/2)` dla obu boków; na zakładce `(X_T, 0)–(X_T+s, s)` | krawędzie T |
| C7 | romb, dolne 45° | `(Xc−D/2, 0)–(Xc, −D/2)` i `(Xc+D/2, 0)–(Xc, −D/2)` dla obu boków; na zakładce `(X_T, 0)–(X_T+s, −s)` | krawędzie trójkąta wewn. / uszu |
| C8 | big płaskiego złożenia | `Y = D/2` na: LEFT (połówka tylna) `X ∈ [0, Xc_L]`, RIGHT (połówka tylna) + cały BACK + zakładka `X ∈ [Xc_R, 2W+2D+s]` | 0° na stojąco, 180° na płasko |

C4 w praktyce biegnie przez cały rękaw (`Y ∈ [−a, H]`), bo tuber bigiuje fałdę na całej długości.
Wewnątrz rombu (`|Y| < D/2`) jest jednak nieaktywny. W eksporcie SVG rysować go przez rombu tylko
jako warstwę informacyjną [Z]. **C8 jest fizyczną linią bigowania [K]** (decyzja klienta, 29.09.2026) —
rysowany na wykroju w warstwie bigów oraz w 3D, na całej szerokości BACK i na tylnych połówkach boków.

**Strefy informacyjne (nie cięcie, nie big):** pas kleju klap dna: FRONT i BACK `Y ∈ [−a, −a+30]`.
Klej na uszach: trójkątne strefy zapasów bocznych poza trójkątem wewnętrznym [T]. Zakładka `s`.

### 9.4 Spad i strefa bezpieczna (flexo)

| | Wartość | Źródło |
|---|---|---|
| spad poza cięcie (góra, koniec rękawa, lewa krawędź X = 0 = wolna krawędź LEFT na szwie) | 3 mm | [T] |
| zachodzenie koloru przez big na sąsiedni panel (także z BACK na zakładkę, 2 mm) | 2 mm | [T], [F goodstart: ≥ 1,6 mm] |
| strefa bezpieczna od góry i od linii dna | 6 mm | [F goodstart 1/4"] |
| strefa bezpieczna od bigów pionowych i szwu | 5 mm | [Z] |
| boki: treść krytyczna powyżej | `Y ≥ D/2 + 5` | [Z] |
| zakładka `s` | bez grafiki (klej) | [T] |

### 9.5 Łatki uchwytów (wewnątrz, na wykroju linią przerywaną)

- FRONT: środek łatki `X = D + W/2`. Zakres `X ∈ [D + W/2 − Lp/2, D + W/2 + Lp/2]`, `Y ∈ [H − 20 − Hp, H − 20]`
  = `[H − 40, H − 20]` [K].
- BACK: środek łatki `X = 2D + 3W/2` (panel-local `x = W/2`). BACK jest w jednym kawałku, więc łatka też.
- `Lp = 100`, `Hp = 20`, górna krawędź 20 mm pod cięciem [K] (`DIELINE_RULES.handlePatch`, `HANDLE_DEFAULTS.patch`).
  Na wąskich ściankach `Lp = min(100, W − 10)` (5 mm od bigów bocznych) [Z]. Końce uchwytu (oba typy):
  `x = W/2 ± c/2`, `c = 80 mm` stałe [K] (`HANDLE_END_SPACING_MM`); zmniejszane tylko, gdy łatka jest za wąska (§5).
  Dawny wzór `Lp = min(170, W − 20)`, `Hp = 45`, `c = clamp(W/2, 75, 150)` [Z] jest wycofany.

### 9.6 Przykład: W = 200, H = 400, D = 150, s = 10 → a = 90, arkusz 710 × 490 mm

X kluczowe: 0 (wolna krawędź LEFT, szew) | 75 (środek LEFT) | 150 (LEFT|FRONT) | 250 (środek FRONT) |
350 (FRONT|RIGHT) | 425 (środek RIGHT) | 500 (RIGHT|BACK) | 600 (środek BACK) | 700 (BACK|zakładka, C3) | 710.
Skala pozioma 1 znak = 10 mm (zakładka 10 mm = kolumna `S` przy C3). Pionowa jest nieliniowa (wiersze opisane wartością Y).

```text
      Y 0      75     150                 350     425    500                  700|710
    400 ########################################################################
    380 #       |      :     +++++++++     :       |      :     +++++++++     :#
    360 #       |      :     +++++++++     :       |      :     +++++++++     :#
    ... #       |      :                   :       |      :                   :#
    200 # LEFT  |      :     FRONT         : RIGHT |      :       BACK        S#
    ... #       |      :                   :       |      :                   :#
     75 #=======A      :                   :       A===========================#
   62.5 #     /  \     :                   :     /  \     :                   :#
     50 #    /    \    :                   :    /    \    :                   :#
   37.5 #   /      \   :                   :   /      \   :                   :#
     25 #  /         \ :                   :  /         \ :                   :#
   12.5 #/            \:                   :/            \:                   :#
      0 #----------------------------------------------------------------------#
  -12.5 #\            /:                   :\            /:                   :#
    -25 #  \         / :                   :  \         / :                   :#
  -37.5 #   \      /   :   FRONT_FLAP      :   \      /   :     BACK_FLAP     :#
    -50 #    \    /    :                   :    \    /    :                   :#
  -62.5 #     \  /     :                   :     \  /     :                   :#
    -75 #       V      :                   :       V      :                   :#
    -82 #       |      :                   :       |      :                   :#
    -90 ########################################################################
  legenda: # cięcie  : big krawędzi rękawa / zawias zakładki C3  | big środkowy fałdy  / \ bigi 45° rombu
           = big płaskiego złożenia  - linia dna  + obrys łatki (wewnątrz)  S zakładka klejowa (10 mm)
```

Romb LEFT: `(0,0)–(75,75)–(150,0)–(75,−75)`. Romb RIGHT: `(350,0)–(425,75)–(500,0)–(425,−75)`.
Na zakładce: C6 `(700,0)–(710,10)`, C7 `(700,0)–(710,−10)`. C8 (`Y = 75`): `X ∈ [0, 75] ∪ [425, 710]`.
Łatka FRONT: `X ∈ [200, 300]`, `Y ∈ [360, 380]` [K]. Łatka BACK: `X ∈ [550, 650]`, `Y` j.w.

---

## 10. Wytyczne dla implementacji

Wszystko w mm, panel-local (§3.1): początek w lewym dolnym rogu, widok z zewnątrz. `W, H, D` z konfiguracji,
`a = (D + 30) / 2` [K], `h = D / 2`.

### 10.1 Bigi i regiony: FRONT (`W × H`)

- Bigi: brak wewnętrznych. Krawędzie: `y=0` (zawias z BOTTOM), `x=0` (z LEFT), `x=W` (z RIGHT).
- Region `FRONT`: `(0,0) (W,0) (W,H) (0,H)`.
- Łatka uchwytu (wewnątrz): `[W/2 − Lp/2, W/2 + Lp/2] × [H − 3 − Hp, H − 3]`.

### 10.2 BACK (`W × H`)

- Bigi: `y = h` od `(0,h)` do `(W,h)` (**pleat**). Krawędzie: `y=0` (z BOTTOM, big tylny), `x=0` (z RIGHT),
  `x=W` (z LEFT).
- Regiony: `BACK_LOWER` `(0,0) (W,0) (W,h) (0,h)` oraz `BACK_UPPER` `(0,h) (W,h) (W,H) (0,H)`.

### 10.3 LEFT i RIGHT (`D × H`)

LEFT (`x=0` przy BACK):

| Element | Geometria |
|---|---|
| big środkowy | `(h, h)–(h, H)` |
| big 45° tylny | `(0, 0)–(h, h)` |
| big 45° przedni | `(D, 0)–(h, h)` |
| big poziomy (pleat) | `(0, h)–(h, h)` |
| `SIDE_T` | `(0,0) (D,0) (h,h)` |
| `SIDE_BACK_LOWER` | `(0,0) (h,h) (0,h)` |
| `SIDE_BACK_UPPER` | `(0,h) (h,h) (h,H) (0,H)` |
| `SIDE_FRONT` | `(h,h) (D,0) (D,H) (h,H)` |

RIGHT (`x=0` przy FRONT) to lustro `x → D − x`:

| Element | Geometria |
|---|---|
| big 45° przedni | `(0,0)–(h,h)` |
| big 45° tylny | `(D,0)–(h,h)` |
| big poziomy | `(h,h)–(D,h)` |
| `SIDE_T` | `(0,0) (D,0) (h,h)` |
| `SIDE_FRONT` | `(0,0) (h,h) (h,H) (0,H)` |
| `SIDE_BACK_UPPER` | `(h,h) (D,h) (D,H) (h,H)` |
| `SIDE_BACK_LOWER` | `(h,h) (D,0) (D,h)` |

UV: każdy region dostaje UV = `(x/D, y/H)` całej ścianki. Grafika jest ciągła i łamie się na bigach
(SPEC §4a).

### 10.4 BOTTOM (`W × D`, widok z dołu, `y=0` big tylny, `y=D` big przedni)

- W animacji: jeden sztywny region `(0,0) (W,0) (W,D) (0,D)`.
- Struktura (tekstura lub opcjonalna geometria warstw, od zewnątrz):
  - `FRONT_FLAP` `[0,W] × [D−a, D]` (wierzch),
  - `BACK_FLAP` `[0,W] × [0, a]`,
  - zakładka `[0,W] × [D/2−15, D/2+15]`,
  - LEFT: `EAR_BACK` `(0,0) (0,a) (h,a) (h,h)`, `EAR_FRONT` `(0,D) (0,D−a) (h,D−a) (h,h)`,
    `TUCK` `(0,0) (0,D) (h,h)`,
  - RIGHT: lustro `x → W − x`.
- Widoczny szew od zewnątrz: odcinek `(0, D−a)–(W, D−a)`, czyli `y = D/2 − 15`.

### 10.5 Kinematyka złożenia (p ∈ [0,1], p=0 torba stojąca, p=1 płaska)

Zalecany model: **jeden parametr sterujący, zamknięte wzory, wszystkie duże panele sztywne,
dolne trójkąty boków sterowane wierzchołkami**. Świat: FRONT nieruchomy w `z = 0`, `x ∈ [0,W]`, `y ∈ [0,H]`.
Easing (płynne dojście) robi UI lub `previewStore`. Poniższe funkcje są czyste.

```text
ψ(p) = π · p                                  // kąt pasa BACK_LOWER na bigu y=h (0 → 180°)
φ(p) = asin( sin²(ψ/2) )                      // obrót dna na PRZEDNIM bigu dna (0 → 90°)
g(p) = D · ( cos φ − ½ · sin ψ )              // odległość przód–tył (D → 0)
θ(p) = acos( g / D )                          // kąt fałdy bocznej (0 → 90°), jak w SPEC §4a
```

| p | ψ | φ | θ | g/D |
|---|---|---|---|---|
| 0 | 0° | 0° | 0° | 1,000 |
| 0,25 | 45° | 8,4° | 50,5° | 0,636 |
| 0,5 | 90° | 30,0° | 68,5° | 0,366 |
| 0,75 | 135° | 58,6° | 80,4° | 0,167 |
| 1 | 180° | 90° | 90° | 0,000 |

Wzór na φ wynika z warunku, że pas BACK_LOWER (szer. `h`) łączy big `y=h` na BACK z tylną krawędzią dna
bez rozciągania [W].

**Zawiasy i transformacje (lewy bok, x = 0; prawy to lustro `x → W − x` ze zmianą znaków obrotu wokół y):**

| Region | Oś zawiasu (świat) | Transformacja punktu panel-local |
|---|---|---|
| FRONT | — (nieruchomy) | `(x, y) → (x, y, 0)` |
| BOTTOM | oś +x przez `(y=0, z=0)`, obrót `+φ` | punkt w odl. `t = D − y_b` od bigu przedniego: `(x_b, t·sin φ, −t·cos φ)` |
| BACK_UPPER | brak obrotu, translacja `z = −g` | `(x, y) → (W − x, y, −g)` |
| BACK_LOWER | oś +x przez `(y=h, z=−g)`, obrót `+ψ` | `(x, y) → (W − x, h − (h − y)·cos ψ, −g − (h − y)·sin ψ)` |
| SIDE_FRONT (LEFT) | pion. krawędź FRONT/LEFT `(x=0, z=0)`, obrót `−θ` wokół +y | `t = D − u` (odl. od krawędzi przodu): `(t·sin θ, v, −t·cos θ)` |
| SIDE_BACK_UPPER (LEFT) | pion. krawędź BACK/LEFT `(x=0, z=−g)`, obrót `+θ` wokół +y | `t = u`: `(t·sin θ, v, −g + t·cos θ)` |
| SIDE_T, SIDE_BACK_LOWER | **sterowane wierzchołkami** (afinicznie, barycentrycznie) | patrz niżej |

Wierzchołki sterujące (LEFT, świat):

```text
F0 = (0, 0, 0)                          // przedni róg dna (stały)
B0 = (0, D·sin φ, −D·cos φ)             // tylny róg dna
K  = (0, h, −g)                         // koniec bigu poziomego na krawędzi tylnej
A  = (h·sin θ, h, −g/2)                 // wierzchołek rombu (na bigu środkowym)
SIDE_T:          local (0,0)→B0, (D,0)→F0, (h,h)→A
SIDE_BACK_LOWER: local (0,0)→B0, (0,h)→K,  (h,h)→A
```

Własności [W, sprawdzone numerycznie]:

- Wszystkie krawędzie mają stałą długość **oprócz** krawędzi `B0–A` (tylny big 45°). Rozciąga się ona
  maks. o ok. **21 %** przy p ≈ 0,3 i wraca do 0 % na obu końcach. To jest fizyczna nie-sztywność torby
  opisana przez Balkcoma. Przez to, że wierzchołki są wspólne, siatka nie ma szczelin. Trójkąt leży w
  większości wewnątrz fałdy.
- Stan p=1: `F0=(0,0,0)`, `B0=(0,D,0)`, `K=(0,h,0)`, `A=(h,h,0)`. Dokładnie odpowiada §3.5.
- **z-fighting przy p→1**: wszystko ląduje w `z = 0`. Kolejność warstw od widza przodu: FRONT → SIDE_FRONT
  → SIDE_T / SIDE_BACK_UPPER / SIDE_BACK_LOWER → BACK_UPPER → BACK_LOWER → BOTTOM. Renderer dodaje
  offset `−ε·k·smoothstep(0.85, 1, p)`, `ε ≈ 0,3 mm` [Z].
- Uproszczenie awaryjne (tylko po konsultacji, SPEC §4a): pominąć BACK_LOWER i bigi poziome, a dno obracać
  bez warunku domknięcia. Wtedy w p=1 góra BACK i FRONT rozjeżdża się o `D`. **Niezalecane.**

### 10.6 Kąty dwuścienne (do cieniowania bigów, 180° = płasko rozłożone)

| Big | p=0 | p=1 |
|---|---|---|
| FRONT–BOTTOM | 90° | 0° (złożony całkowicie) |
| BACK_UPPER–BACK_LOWER | 180° | 0° |
| BACK_LOWER–BOTTOM | 90° | 0° |
| FRONT–SIDE_FRONT, BACK_UPPER–SIDE_BACK_UPPER (`90° − θ`) | 90° | 0° |
| big środkowy boku SIDE_FRONT–SIDE_BACK_UPPER (`180° − 2θ`) | 180° | 0° |
| SIDE_BACK_UPPER–SIDE_BACK_LOWER (big poziomy boku) | 180° | 0° |

Renderer może je liczyć z normalnych regionów.

### 10.7 Reguły walidacji domeny (propozycja)

| Kod | Warunek | Poziom |
|---|---|---|
| `NOT_ON_STEP` | W, H, D podzielne przez 5 | błąd [K] |
| `DEPTH_EXCEEDS_WIDTH` | `D ≤ W` | błąd [K] |
| `HEIGHT_TOO_SMALL_FOR_DEPTH` | `H > D/2` twardo; zalecane `H ≥ D` | błąd / ostrzeżenie [F/W] |
| `DEPTH_ABOVE_MACHINE_RATIO` | `D > 0,65·W` | ostrzeżenie [F dane maszyn], do potwierdzenia |
| `CUTOFF_OUT_OF_RANGE` | `H + (D+30)/2` poza zakresem maszyny klienta | ostrzeżenie, zakres do potwierdzenia |
| `HANDLE_WIDTH_TOO_SMALL` | uchwyt przy `W < W_min_handle` (≈180?); geometria zmniejsza rozstaw poniżej W = 95 / 110 (`endSpacingReduced`, §5) | do potwierdzenia |

Stałe do `productCatalog.ts`: `BOTTOM_OVERLAP_MM = 30`, `BOTTOM_ALLOWANCE = (D) => (D + 30) / 2`,
`SEAM_FLAP_MM = 10` [K] (`DIELINE_RULES.glueFlapWidth`), szew na krawędzi BACK/LEFT [K], `DIELINE_RULES.handlePatch = { width: 100, height: 20, topOffset: 20 }` [K] (+ `sideClearance: 5` [Z]), `HANDLE_END_SPACING_MM = 80` [K],
`FLAT_FOLD_PLEAT_RATIO = 0.5`.

---

## 11. Otwarte pytania do produkcji klienta

1. **Zakres D**: potwierdzić 40–170 mm (maszyna klasy TRIUMPH 2B/2-T8) zamiast 40–300. Jaki jest
   maks. stosunek D/W na maszynie klienta?
2. **Która maszyna i jaki zakres cut-off** (`H + (D+30)/2`)? Przy jakich minimach się zatrzymuje?
3. ~~**Szew wzdłużny**: na BACK (środek czy przesunięty)? Jaka szerokość zakładki (proponujemy 20 mm)?~~
   Rozstrzygnięte [K] (29.09.2026): szew na krawędzi rękawa BACK/LEFT, zakładka 10 mm (§9.1–9.2). Do potwierdzenia
   pozostaje tylko strona klejenia: zakładka od wewnątrz pod wolną krawędzią LEFT (nasze założenie [Z]) czy na wierzchu.
   Czy tuber klienta prowadzi szew na krawędzi (zakładka w fałdzie bocznej, podwójna warstwa w dnie po stronie LEFT)?
4. **Kolejność klap dna**: czy przednia klapa jest na wierzchu (zakładamy tak), czy tylna?
5. **Na którą ściankę dno kładzie się w torbie płaskiej** (zakładamy BACK, z zawiasem na przednim bigu)?
   ~~Czy big `D/2` na tyle jest bigowany na wstędze?~~ Rozstrzygnięte: tak, to linia bigowania (C8) [K].
6. **Strefy kleju dna**: tylko zakładka 30 mm, czy też uszy? Czy stosujecie łatę lub wkładkę dna?
7. **Uchwyty bez zawinięcia górnego**: czy to realny wariant produkcyjny (wytrzymałość łatki przy
   krawędzi cięcia)? Minimalne W dla uchwytów skręcanych i płaskich? Wysokość (długość) pętli?
   Rozstrzygnięte [K] (29.09.2026): łatka 100 × 20 mm, 20 mm pod górną krawędzią, rozstaw końców zawsze 80 mm,
   taśma płaska 20 mm (§5, §9.5).
8. **Gramatura z uchwytem**: minimalna gramatura dla toreb z uchwytem (typowo ≥ 70–80 g/m²)?
9. **Nadruk**: inline na tuberze czy rola zadrukowana wcześniej (8 kolorów)? Tolerancja nadruku względem
   bigów i cięcia? Czy drukujecie zapas dna (widoczny od spodu)?
10. **Górna krawędź**: prosta czy ząbkowana? Czy jest wycięcie na kciuk?

---

## 12. Źródła

- Promar Jarocin, torby klockowe (wymiary, papier, uchwyty, druk, nakład): <https://www.promarjarocin.pl/torby-klockowe/>
- Garant (W&H), block bottom bag machines, dane TRIUMPH: <https://www.garant.wh.group/en/our_machines/new_machines/block_bottom_bag_machines/>
- W&H, small bag machines: <https://www.wh.group/int/en/our_products/converting/small_paper_bag_carrier_bag_machines/>
- Garant TRIUMPH 5 QT/SK (uchwyty skręcane; dane z wyniku wyszukiwania): <https://www.pulpandpaper-technology.com/products/garant-maschinenhandel/block-bottom-bag-machines>
- Newlong (ogłoszenia maszyn używanych, zakresy): <https://www.machinio.com/newlong/paper-plastic-bag-machines>
- Balkcom, Demaine, Demaine, Ochsendorf, You, *Folding Paper Shopping Bags*: <https://erikdemaine.org/papers/PaperBag_OSME2006/paper.pdf>
- US 6 623 162 *Block bottom bag* (otwór prostokątny, kolejność klap): <https://patents.google.com/patent/US6623162>
- US 5 520 464 *Heat seal SOS bag*: <https://patents.google.com/patent/US5520464>
- US 5 518 316 *Heat sealed bag*: <https://patents.google.com/patent/US5518316>
- Charles Stilwell (SOS, 1883): <https://en.wikipedia.org/wiki/Charles_Stilwell>
- EN 13590:2003: <https://www.en-standard.eu/bs-en-13590-2003-packaging-flexible-carrier-bags-for-the-transport-of-various-retail-goods-general-characteristics-and-test-methods-for-the-determination-of-volume-and-carrying-capacity/>
- CEPI Eurokraft / EUROSAC (6 kg, 5 użyć): <https://www.cepi-eurokraft.org/?p=4502>, <https://www.paperfirst.info/strong-reliable-reusable-trust-your-paper-bag/>
- Uchwyty (Ø sznurka, taśma, długość, rozstaw): <https://paperbagline.com/blog/twisted-handle-paper-bag-machine-vs-flat-handle/>, <https://cxgiae.com/blog/twisted-handle-vs-flat-handle-vs-rope-handle-choosing-the-right-paper-bag-handle/>
- Wytyczne druku inline flexo (spad, marginesy, linie): <https://www.goodstartpackaging.com/paper-handle-bags-printing-guidelines/>
- Pasowanie flexo: <https://www.ketegroup.com/printing-registration/>
