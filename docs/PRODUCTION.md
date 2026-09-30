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
| **[P]** | Propozycja wynikająca z nowych wytycznych klienta, **jeszcze niezaimplementowana** / czeka na decyzję. |
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
| klapa przednia / tylna dna | front / back bottom flap | Zapas pod FRONT / BACK (`W × a`). Kładzie się na dnie; klapy zachodzą na siebie. **Klapa tylna na wierzchu** [K]. |
| zawinięcie boczne dna (trójkąt) | corner tuck, gusset tuck | Zapas pod ścianką boczną, złożony w trójkąt 45° (dolna połowa „rombu”). |
| „uszy” zawinięcia | ears, dog-ears | Części zapasu bocznego za liniami 45°. Są złożone na trójkąt i przyklejone do klap. |
| romb (karo) | diamond | Kwadrat obrócony o 45° na ściance bocznej i jej zapasie, o przekątnej `D` na linii dna. Jego górna połowa to trójkąt T na ściance. |
| zakładka klapy dna | bottom flap overlap | Pas, w którym klapa tylna zachodzi na przednią: **OV = 2E − D = 30 mm** (z reguły [K], patrz §3.2, §3.4). |
| big dolinowy / grzbietowy | valley / mountain crease | Kierunek zgięcia widziany **od strony druku** wg konwencji klienta [K]: V — strona zadrukowana na zewnątrz zgięcia, M — strona zadrukowana do środka (§9.3). |
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
   4. **Złożenie klapy przedniej**, potem **klapy tylnej na przednią** i ich sklejenie na zakładce OV **[K]**
      (decyzja klienta 29.09.2026: klapa tylna na wierzchu). Patent US 6 623 162 opisuje odwrotną kolejność
      („back flap 58 is folded … then front flap 56 is folded … over the already-folded-over back flap”) —
      **obowiązuje kolejność klienta**.
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

**Warunki formowania dna [K]** (specyfikacja klienta, oznaczenia: `E` = głębokość klapy = zapas `a`, `OV` = zakładka):
`E = (OV + D) / 2`, `OV = 30`, **`E ≥ D/2`** (wierzchołek trójkąta boku `D/2` mieści się w zapasie) i
**`OV = 2E − D > 0`** (klapy zachodzą na siebie — jest pas kleju). Sprawdza je `validateBottomFlaps`
(`src/domain/validation/bottom.ts`, testy); przy regule `E = (D + 30)/2` są spełnione dla każdego `D`.

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
  `D` ma wysokość `D/2` [W]. Pod linią dna ten sam trójkąt (odwrócony) widać od spodu jako część klapy boku między przekątnymi
  trapezów (§3.4) — na zapasie boku nie ma jednak bigów (klapa boku składa się w całości [K]).
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

> **Stan implementacji (29.09.2026): model klienta [K] wdrożony** (`blockBottom.ts`, `assemblyKinematics.ts`,
> `buildDieline.ts`, renderer). Reguły klienta: (1) bigi dna są na strefach **przodu i tyłu** (C9), nie na bokach;
> (2) strefy **boków** (`D × E`) składają się **w całości** o 90° na linii dna, bez bigów ukośnych (C5 i C7 usunięte);
> (3) potem trapez przodu, na końcu trapez tyłu na wierzch (zakład OV = 2E − D = 30 mm). Narożne trójkąty („uszy”)
> przodu/tyłu obracają się o 180° na C9 i leżą między klapą boku a swoim trapezem (§3.4.2). `E = (D + 30)/2` bez zmian
> dla wszystkich ścianek [K] (nie zależy od W). Model składania boków jest w kodzie odizolowany
> (`getBottomZonePieces` dla LEFT/RIGHT + transformacja `*_SIDE_FLAP`), więc można go podmienić bez ruszania `E`
> i trapezów przodu/tyłu.
>
> Oznaczenia klienta: `E = (OV + D)/2` (≡ nasze `a`), `OV = 30` (zakład = pole kleju), `G` (zakładka rękawa).
> Warunki: `E > D/2`, `OV = 2E − D`, `W − 2E ≥ 0` (inaczej trapez przechodzi w trójkąt — ostrzeżenie
> `BOTTOM_TRAPEZOID_DEGENERATE`, §10.7). Poniżej `t` = odległość w dół od linii dna (`t ∈ [0, E]`); u klienta strefa
> dna to `y ∈ [H, H+E]`, tj. `y_klient = H + t`.

#### 3.4.1 Bigi na zapasie (strefa dna) [K]

Strefa dna **nie jest nacinana**. Każdy panel składa się **pełną płaszczyzną**: cała strefa obraca się o 90°
na linii dna do wnętrza. Bigi 45° wyznaczają część widoczną na spodzie i część zawijaną do środka.

| Panel (lokalne `x` panelu) | Bigi 45° w strefie dna | Widoczne na spodzie | Ukryte |
|---|---|---|---|
| LEFT / RIGHT (`x ∈ [0,D]`) | **brak** — strefa składa się w całości [K] | **trójkąt** `(0,0),(D,0),(D/2,D/2)` (część klapy boku między przekątnymi trapezów): podstawa D, wysokość D/2 | reszta klapy boku (pod trapezami) |
| FRONT / BACK (`x ∈ [0,W]`) | `(0,0)→(E, E)` i `(W,0)→(W−E, E)` (**C9**, V) | **trapez** `(0,0),(W,0),(W−E,E),(E,E)`: W przy linii dna → `W − 2E` na krawędzi, ramiona 45°, wysokość E | 2 połówki uszu `(0,0),(0,E),(E,E)` + lustro |
| wszystkie | linia dna `t = 0` (C1) | — | — |

Współrzędne w tabeli: `(x, t)`. Ucho (trójkąt narożny przodu/tyłu) jest połączone z klapą boku krawędzią rękawa
(C2 / C3 przedłużone w strefę dna, długość E); po złożeniu leży odwrócone między klapą boku a swoim trapezem.
Przy `W < 2E` bigi C9 kończą się w punkcie przecięcia `t = W/2` (trapez → trójkąt, uszy → czworokąty do `x = W/2`),
bez NaN; zob. §10.7.

Przykład klienta `W = 250, D = 200, OV = 30 → E = 115`: trapez 250 → 20 mm, trójkąt boku 200 × 100, pas pod
wierzchołkiem boku 15 mm, ucho przodu/tyłu: trójkąt o przyprostokątnych 115 mm.

#### 3.4.2 Kolejność składania (wytyczne klienta [K]) i położenie uszu [W]

1. Skleić rękaw (zakładka G) i złożyć na płasko z bokami wpuszczonymi po osiach.
2. Zagiąć strefę dna na linii dna, zaprasować, rozłożyć.
3. Otworzyć dno w „romb”: boki kładą się pełną płaszczyzną do środka jako trójkąty, uszy zawijają się po bigach 45°.
4. Zagiąć klapę przodu (trapez).
5. Nałożyć klej na zakład OV i zagiąć klapę tyłu (trapez) **na wierzch**.
6. Rozłożyć torbę i docisnąć dno do prostokąta `W × D`.

**Widok od spodu [K]:** „X” z przekątnych; po bokach 2 trójkąty z materiału boków, u góry i u dołu 2 trapezy
z przodu i tyłu, w środku zakład 30 mm.

```text
 widok od spodu, układ BOTTOM (y=0 big tylny, y=D big przedni), W=250, D=200, E=115
  y=200 ┌──────────────────────────────────────────┐  big przedni
        │ \                                      / │
        │    \     TRAPEZ PRZODU (widoczny)   /    │
  E=115 ├═══════\════ krawędź trapezu tyłu ═/══════┤  widoczny szew (tył na wierzchu)
  D/2   │ LEFT    X                        X  RIGHT│  X = wierzchołki trójkątów (D/2, D/2), (W−D/2, D/2)
  D−E=85├ ─ ─ ─ /─ ─ krawędź przodu (ukryta) \─ ─ ─┤  zakład OV = 30 mm: y ∈ [85, 115]
        │    /     TRAPEZ TYŁU (wierzch)        \  │
        │ /                                       \│
  y=0   └──────────────────────────────────────────┘  big tylny
   trójkąt LEFT: (0,0),(0,200),(100,100); trapez tyłu: (0,0),(250,0),(135,115),(115,115)
```

**Położenie ucha (wyprowadzenie, zaimplementowane) [W]:** ucho przodu `(0,0),(0,E),(E,E)` (lokalnie `(x, t)`) jest
spięte z klapą boku krawędzią rękawa `(0, t)`. Gdy klapa boku obraca się o β na linii dna, ta krawędź przechodzi
z pionu na linię dna przodu: punkt `(0, t)` → `(t, 0)`. To dokładnie odbicie ucha względem jego przekątnej C9
(obrót o 180°): ucho ląduje na trapezie w obszarze `(0,0),(E,0),(E,E)`, **po wewnętrznej stronie trapezu** (inaczej
krawędź łącząca je z klapą boku przechodziłaby przez trapez). Faza C obraca trapez razem z uchem (krawędź leży na osi
obrotu). W trakcie fazy B kąt 3D między krawędzią a przekątną spada poniżej 45° (do 0 przy β = 45°), więc ucho zgina
się wzdłuż dwusiecznej swojego narożnika (`EAR_BEND_ANGLE` = 22,5°, zgięcie papieru, nie big) — **do środka torby**
(decyzja klienta 30.09.2026, zmiana z „na zewnątrz” z 29.09; przy β = 45° część narożna ucha leży w płaszczyźnie
obracającej się klapy boku). Zawiasy są domknięte w każdej
chwili (testy `assemblyKinematics.test.ts`).

**V / M w strefie dna [W]:** C1 V (strefa obraca się do środka), C9 **V** (ucho kładzie się niezadrukowaną stroną na
niezadrukowaną stronę trapezu, druk na zewnątrz zgięcia), a krawędzie rękawa C2 / C3 w strefie dna są **M**: odwrócone
ucho leży zadrukiem do góry, pod klapą boku, której zadruk jest skierowany w dół (druk do druku). Kontrola w narożniku
arkusza (6 bigów: C1 ×2, C2/C3 ×2, C6, C9; sektory 90°, 45°, 45°, 90°, 45°, 45°): Maekawa `|M − V| = |2 − 4| = 2`,
Kawasaki 180° / 180° — narożnik jest płasko-składalny (test w `buildDieline.test.ts`).

**Kolejność warstw [K]** (od środka torby na zewnątrz): **klapy boków** (+ zakładka klejowa na LEFT) → uszy przodu →
**trapez przodu** → uszy tyłu → **trapez tyłu** (wierzch, klej OV na zadruku trapezu przodu). Klapy boków leżą więc
**pod** oboma trapezami; w animacji żadna klapa boku nie przechodzi nad trapezem (boki są już w dnie, zanim trapez
opuści pion). W 3D (render) warstwy są odsunięte **na zewnątrz** od klap boków o `BOTTOM_LAYER_OFFSET_MM = 0,1` mm na
warstwę [K]: klapy boków 0, uszy przodu 0,05, trapez przodu 0,1, uszy tyłu 0,15, trapez tyłu 0,2 mm — w torbie
uformowanej, stojącej, płaskiej i w trakcie składania (skalowane z fazą rękawa, arkusz 0 % jest płaski).

**Widok od spodu (zaimplementowany):** trapez tyłu w całości, odsłonięta część trapezu przodu (pas `y ≥ E` + dwa małe
trójkąty przy przekątnych tyłu) i dwa trójkąty boków `(0,0),(D/2,D/2),(0,D)` + lustro — razem dokładnie `W × D`
(`getVisibleBottomPieces`); uszy zawsze schowane. Linie od spodu: przekątne trapezu tyłu, widoczne połówki przekątnych
trapezu przodu i krawędź trapezu tyłu `y = E` (szew).

#### 3.4.2a Poprzedni model (prostokątne klapy, uszy z boków) — usunięty z kodu 29.09.2026, tylko dla historii

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

 3) klapa przednia (W × a) na dno:         4) klapa tylna (W × a) na klapę przednią, klej [K]:
    y ∈ [D−a, D] = [D/2−15, D]                 y ∈ [0, a] = [0, D/2+15]

   y=D ┌───────────────────────────────┐    y=D ┌───────────────────────────────┐
       │ KLAPA PRZEDNIA                │        │ klapa przednia (widoczna część)│
       │                               │ D/2+15 ├═══════ krawędź klapy, widoczny szew ══┤
 D/2−15├───────────────────────────────┤        │                               │
       │  (trójkąty/uszy widoczne)     │        │ KLAPA TYLNA (wierzch)         │
   y=0 └───────────────────────────────┘    y=0 └───────────────────────────────┘
                                             zakładka klejowa: y ∈ [D/2−15, D/2+15] = 30 mm
```

Kolejność warstw od wnętrza torby na zewnątrz [W; kolejność klap **[K]**, odwrotnie niż US 6 623 162]:

1. **Trójkąty wewnętrzne** zapasów bocznych. Są przedłużeniem ścianek bocznych, obrócone o 90° do środka
   na linii dna. To one są widoczne od środka torby przy krótkich krawędziach dna. Wierzchołki: LEFT
   `(0,0), (0,D), (D/2, D/2)` w układzie BOTTOM, RIGHT to lustro `x → W − x`.
2. **Uszy**, odwinięte o 180° po liniach 45° i leżące pod trójkątem wewnętrznym. Ucho tylne LEFT zajmuje
   `(0,0), (0,a), (D/2,a), (D/2,D/2)`, ucho przednie LEFT `(0,D), (0,D−a), (D/2,D−a), (D/2,D/2)` [W].
   Krawędź ucha, która była narożnikiem rękawa, ląduje na krótkiej krawędzi dna (`x = 0`), dokładnie
   pod krawędzią klapy. Dlatego nic nie wystaje poza obrys `W × D`.
3. **Klapa przednia** `W × a`, pas `y ∈ [D − a, D]`.
4. **Klapa tylna** `W × a`, pas `y ∈ [0, a]`, **na wierzchu [K]**. Klej w pasie zakładki 30 mm (na stronie
   zadrukowanej klapy przedniej, pod wewnętrzną stroną klapy tylnej) i na stykach klap z uszami [T].

Wnioski geometryczne [W]:

- Trójkąty wewnętrzne LEFT i RIGHT mają wierzchołki w `x = D/2` i `x = W − D/2`. Nie nachodzą na siebie
  tylko wtedy, gdy **`D ≤ W`**. To fizyczne uzasadnienie reguły klienta. Przy `D = W` wierzchołki się
  stykają.
- Zapas zużyty na dno: `a` z każdej ścianki. Pole papieru dna: `2·W·a + 2·D·a`, a pole dna to `W·D`.
  Różnica to podwójne i potrójne warstwy (uszy, zakładka).
- Od zewnątrz widać jedną linię: krawędź klapy tylnej w `y = a = D/2 + 15` (BOTTOM-local) [K]. Obrys
  trójkątów może lekko przebijać przez papier (embossing) jako subtelny detal renderu [Z].

**Proponowany warunek wymiarów (wynika z wytycznych, czeka na decyzję klienta) [P]:** `W ≥ 2E = D + OV` (np. D = 200 → W ≥ 230). Przy `W < D + 30` trapez przechodzi
w trójkąt (ramiona 45° przecinają się przed krawędzią), a pasy boków `t ∈ [D/2, E]` nachodzą na siebie — proponowane
ostrzeżenie domeny `BOTTOM_TRAPEZOID_DEGENERATE` (do decyzji: błąd czy ostrzeżenie). Reguła `D ≤ W` jest przez to
w praktyce zaostrzona do `D ≤ W − 30`.

#### 3.4.3 Bigi na dolnych częściach czterech ścianek (nad linią dna)

| Ścianka | Bigi w strefie `y < D` | Rola |
|---|---|---|
| FRONT | tylko linia dna `y = 0` (zawias z dnem) | W stanie płaskim FRONT jest najniżej, a dno obraca się na tym bigu (§3.5). |
| BACK | linia dna `y = 0` **oraz big poziomy `y = D/2` na całej szerokości** | Pas `y ∈ [0, D/2]` składa się przy spłaszczaniu na zewnątrz i do góry, pod dno. |
| LEFT / RIGHT | linia dna, 45° do A, poziomy `v = D/2` na połówce tylnej, pionowy środkowy od A w górę | §3.3 |

**Co zostaje po zmianie modelu dna (reguła klienta 5) [W]:** wszystkie bigi ścianek nad linią dna — C4 (środek fałdy),
C6 (45° do A), C8 (`D/2`) — **zostają bez zmian**. Uzasadnienie: po sklejeniu dno jest sztywnym laminatem `W × D`
(trapezy + uszy + klapy boków), obojętne, jak warstwy leżą w środku. Spłaszczenie (§3.5, §10.5) używa tylko zawiasów
tego laminatu ze ściankami (przedni i tylny big dna, boczne linie dna między trójkątem T a klapą boku) oraz bigów
ścianek; kinematyka i stan płaski są identyczne jak w poprzednim modelu. Linia dna boku łączy teraz T z **całą** klapą
boku (wcześniej z trójkątem wewnętrznym) — też część sztywnego dna. Nowe wierzchołki w narożnikach arkusza (C1, C2/C3,
C6, C9) są płasko-składalne (Maekawa/Kawasaki, §3.4.2), a C7 znikł, więc nic nie koliduje ze stanem płaskim.

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
  - ze strefy dna BACK widać od spodu cały trapez (wierzch [K]); uszy są schowane,
  - ze strefy dna FRONT widać część trapezu, której nie przykrywa trapez tyłu,
  - ze stref dna boków widać trójkąty `(0,0),(D,0),(D/2,D/2)` (lokalnie `(x, t)`) między przekątnymi trapezów; reszta
    klapy boku jest pod trapezami (`getVisibleBottomZoneParts`, `printCoverage/bottomVisibility.ts`),
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

### 4.1 Grafika na dnie (wytyczne klienta 29.09.2026) [K]

- Na spodzie widać tylko trójkąty boków i trapezy klap (§3.4.1). Uszy i pasy boków są niewidoczne — nadruk tam
  opcjonalny.
- **EAN** na trapezie tyłu (klapa wierzchnia), w strefie do ok. `E/2` od linii dna, gdzie trapez ma szerokość
  `≥ W − E`. Przykład W = 250, E = 115: pas 57 mm od linii dna, szerokość ≥ 135 mm.
- Pliki grafik o wysokości `H + E` (ścianka + strefa dna) obsługuje zaimplementowana opcja rozmieszczenia
  „Rozciągnij na dno” (`extendToBottom`, SPEC §4f) — obszar grafiki panelu obejmuje wtedy zapas dna.

### 4.2 Animacja składania dna (wytyczne klienta, opcjonalna) [K]

- **Zaimplementowane** (`assemblyKinematics.ts`, `blockBottom.ts`, szczegóły §10.8). Podział strefy dna, lokalnie `(x, t)`:
  - FRONT / BACK: `TRAPEZOID (0,0),(W,0),(W−E,E),(E,E)`, `EAR_START (0,0),(0,E),(E,E)`, `EAR_END (W,0),(W,E),(W−E,E)`
    (ucho dodatkowo dzielone linią gięcia na część narożną i część przy przekątnej);
  - LEFT / RIGHT: **cała strefa `D × E` jednym sztywnym kawałkiem** (bez bigów).
- Faza A: rękaw — obroty 90° na pionowych krawędziach. Faza B: boki 90° na linii dna (w całości); uszy 180° wokół C9,
  zginając się po dwusiecznej na zewnątrz. Faza C1: trapez przodu 90°, C2: trapez tyłu 90° na wierzch. Fazy są ściśle
  po kolei; offset warstw 0,1 mm na warstwę (§3.4.2).
- Stan końcowy od spodu: widoczne trójkąty boków i trapezy; uszy i reszta klap boków schowane pod trapezami.

## 5. Uchwyty

| Parametr | Skręcany (TWISTED_PAPER) | Płaski (FLAT_PAPER) | Źródło |
|---|---|---|---|
| przekrój | sznurek Ø 3–5 mm (podgląd: 5 mm) | taśma **20 mm** | [T] paperbagline, cxgiae / **[K]** płaski |
| długość sznurka | 340–460 mm | — | [T] paperbagline |
| szerokość uchwytu po zewnętrznych krawędziach | **90 mm, stała** (niezależna od W) | **90 mm, stała** | **[K]** (29.09.2026) |
| wysokość pętli nad górną krawędzią | **50 mm** (zadana) | **50 mm** | **[K]** (29.09.2026) |
| łatka (pasek mocujący) | **110 × 20 mm** (90 + 2 · 10 naddatku) | **110 × 20 mm** | **[K]** (29.09.2026) |
| papier łatki | 80–120 g/m² kraft | j.w. | [Z] |
| pozycja łatki | od wewnątrz FRONT i BACK, wyśrodkowana (`x = W/2`), górna krawędź łatki **20 mm** pod górną krawędzią → `y ∈ [H − 40, H − 20]` | j.w. | **[K]** |

- Uchwyty są tylko na FRONT/BACK [K]. Bez zawinięcia górnego łatka jest klejona 20 mm pod krawędzią
  cięcia [K]. W typowej torbie z uchwytem łatkę zakrywa zawinięcie. Brak zawinięcia to decyzja
  klienta i trzeba ją potwierdzić ze względu na wytrzymałość (§11).
- **Proporcje uchwytu [K]** (klient, 29.09.2026: „uchwyty niższe i trochę szersze”, „łatka zostaje po 10 mm
  z każdej strony”): szerokość po zewnętrznych krawędziach **90 mm** (`HANDLE_OUTER_WIDTH_MM = 90`), pętla
  **50 mm** nad górną krawędzią (`HANDLE_LOOP_HEIGHT_MM = 50`), łatka **110 × 20 mm** (90 + 2 · 10,
  `PATCH_OVERHANG_MM = 10`). Poprzednie wartości (80 mm, długość pętli 180 → ok. 72 mm, łatka 100 × 20) są wycofane.
- Wysokość pętli jest **zadana**; długość łuku (półelipsa) wynika z wysokości i rozstawu: sznurek Ø5 (rozstaw osi
  85 mm) ok. 146 mm, taśma 20 mm (rozstaw 70 mm) ok. 135 mm [W].
- Końce uchwytu (oba typy) biegną pionowo w dół na `x = W/2 ± c/2`, `c = 90 − szerokość uchwytu` [K], i kończą się
  pod łatką, 5 mm nad jej dolną krawędzią [Z]. Sznurek Ø5 → c = 85 mm, taśma 20 mm → c = 70 mm i zajmuje
  `|x − W/2| ∈ [25, 45]`, czyli z łatką `[−55, 55]` zostaje 10 mm naddatku; końce proste, bez stopek [Z].
- Zabezpieczenie wąskich ścianek [Z]: łatka zachowuje 5 mm od bocznych bigów, szerokość `min(110, W − 10)`
  (dotyczy W < 120). Gdy `W − 10 < 110`, rozstaw jest zmniejszany tak, by zachować 10 mm naddatku łatki
  (`c = łatka − 20 − szerokość uchwytu`), nigdy poniżej 2 szerokości uchwytu; układ ma wtedy flagę
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

> Uwaga: wytyczne „dno krzyżowe” (29.09.2026) podają przykładowo układ `[G][W tył][D lewy][W przód][D prawy]`
> z `G = 20 mm`. **Nie jest on przyjęty** — klient wybrał „jak jest teraz” [K]: układ poniżej, zakładka 10 mm,
> szew na krawędzi BACK/LEFT, końce zakładki ścięte 45° (zaimplementowane, przykład 200 × 400 × 150 → arkusz 710 × 490).

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
**Oba końce zakładki są ścięte pod 45° [K]** (decyzja klienta 29.09.2026): swobodna krawędź zakładki jest krótsza —
cięcie biegnie od zawiasu C3 na górnej krawędzi ukośnie do krawędzi swobodnej (`s` w bok, `s` w dół) i tak samo na
dolnym końcu (koniec zapasu dna). Zakładka to trapez o polu `s · (L − s)`; szerokość `s` i położenie szwu bez zmian.

### 9.3 Linie cięcia i bigowania

`Xc_L = D/2`, `Xc_R = W + 3D/2` (środki boków), `X_T = 2W + 2D` (zawias zakładki), `a = (D+30)/2`.

**Cięcie (CUT):**

1. Obrys arkusza `X ∈ [0, 2W+2D+s]`, `Y ∈ [−a, H]` z **ściętymi 45° końcami zakładki [K]** (§9.2): kontur
   `(0,−a) → (X_T,−a) → (X_T+s, −a+s) → (X_T+s, H−s) → (X_T, H) → (0, H)` — 6 odcinków. Góra: prosto
   (opcjonalnie ząbkowana w przyszłości). Dół (koniec rękawa): prosto.
2. **Brak nacięć klap dna.** Dno klockowe z rękawa powstaje wyłącznie przez składanie. Nacięcia
   z patentów US 5 518 316 i US 5 520 464 dotyczą wariantów zgrzewanych [F]. Opcjonalne ścięcie
   narożników zakładki `s` (§9.2).

**Bigi (CREASE):**

| # | Linia | Odcinek(i) | Typ w torbie stojącej | V / M od strony druku |
|---|---|---|---|---|
| C1 | linia dna | `Y = 0`, `X ∈ [0, 2W+2D+s]` | 90° (ścianka–dno) | **V** [K] |
| C2 | krawędzie rękawa | `X ∈ {D, W+D, W+2D}` (LEFT/FRONT, FRONT/RIGHT, RIGHT/BACK), `Y ∈ [−a, H]` | 90° (grzbiet) | **V** [K] na ściance; **M** [W] w strefie dna `Y < 0` (odcinki `*-Z`, §3.4.2) |
| C3 | zawias zakładki = krawędź BACK/LEFT | `X = X_T`, `Y ∈ [−a, H]` | 90° (grzbiet; zakładka pod LEFT od wewnątrz) | **V** [K] (krawędź ścianki); **M** w strefie dna (`C3-Z`) |
| C4 | środek fałdy (ścianka) | `X ∈ {Xc_L, Xc_R}`, `Y ∈ [D/2, H]` | 0° na stojąco, 180° na płasko | **M** [K] |
| C6 | romb, górne 45° (= linia 5 specyfikacji klienta) | `(Xc−D/2, 0)–(Xc, D/2)` i `(Xc+D/2, 0)–(Xc, D/2)` dla obu boków; na zakładce `(X_T, 0)–(X_T+s, s)` | krawędzie T | **M** [K] |
| C9 | ramiona trapezów przód/tył [K] (zaimplementowane 29.09.2026, §3.4) | w strefie dna pod FRONT i BACK: `(X0, 0)–(X0+m, −m)` i `(X1, 0)–(X1−m, −m)`, `m = min(E, W/2)`, `X0, X1` = krawędzie panelu | ucho zawinięte 180° do środka, między klapą boku a trapezem | **V** [W] (druk na zewnątrz zgięcia) |
| — | C5, C7 (dawne bigi w strefach dna boków) | **usunięte** [K]: strefy boków składają się w całości | — | — |
| C8 | big płaskiego złożenia (nasz, poza specyfikacją klienta) | `Y = D/2` na: LEFT (połówka tylna) `X ∈ [0, Xc_L]`, RIGHT (połówka tylna) `[Xc_R, W+2D]`, cały BACK `[W+2D, X_T]`, zakładka `[X_T, X_T+s]` | 0° na stojąco, 180° na płasko | **V** na połówkach boków i zakładce, **M** na BACK [W] |

**Konwencja V / M [K].** Klient podaje typ bigu widziany od strony druku: V (dolina) — krawędzie ścianek, linia
dna, trójkąty boków w zapasie; M (grzbiet) — osie boków (fałda) i ukośne bigi 45° na bokach. Wynika z tego, że
**V = strona zadrukowana na zewnątrz zgięcia**, **M = strona zadrukowana do środka** (odwrotnie niż w konwencji
origami; sprawdzone na modelu kinematycznym, test `fold direction of the wall creases` w `foldKinematics.test.ts`).
**Linia 5 specyfikacji klienta ≡ nasze bigi 45° C6** (od dolnych narożników boku do wierzchołka `D/2`). Zakładka
kontynuuje typy LEFT (C6 M, C8 V).

**Decyzja: C8 [W].** Big poziomy `D/2` (wymagany do płaskiego złożenia, §3.3) zmienia kierunek na krawędziach
BACK/bok: na **BACK jest M** (dolny pas BACK obraca się na zewnątrz i do góry, druk do druku), na **połówkach tylnych
boków i na zakładce V**. To jedyne przypisanie, przy którym wierzchołek rombu A (C4 M, dwa C6 M, C8) spełnia
tw. Maekawy `|M − V| = 2` (test w `buildDieline.test.ts`); zgodne też z kinematyką złożenia (§10.5).
W kodzie: `DielineLine.kind: 'VALLEY' | 'MOUNTAIN'`, `CREASE_FOLDS` + `ZONE_CORNER_EDGE_FOLD` w `buildDieline.ts` (kody C1–C4, C6, C8, C9).

**Eksport SVG — warstwy [K]:** `print` (grafiki), `annotations` (wymiary, spad, strefa bezpieczna, zapasy, łatki,
opisy — informacyjnie), `glue`, `crease_valley` (niebieska przerywana), `crease_mountain` (turkusowa
kreska-kropka), `cut` (czerwona linia). Warstwy mają etykiety Inkscape; PDF i widok 2D rysują to samo (legenda
V / M w widoku 2D).

C4 w praktyce biegnie przez cały rękaw (`Y ∈ [−a, H]`), bo tuber bigiuje fałdę na całej długości.
Wewnątrz rombu (`|Y| < D/2`) jest jednak nieaktywny. W eksporcie SVG rysować go przez rombu tylko
jako warstwę informacyjną [Z]. **C8 jest fizyczną linią bigowania [K]** (decyzja klienta, 29.09.2026) —
rysowany na wykroju w warstwie bigów oraz w 3D, na całej szerokości BACK i na tylnych połówkach boków.

**Strefy informacyjne (nie cięcie, nie big):** pas kleju klap dna **OV** na końcu rękawa, `Y ∈ [−a, −a + OV]`
(u klienta `y ∈ [H + E − OV, H + E]` od górnej krawędzi) pod FRONT i pod BACK. Klapa tylna na wierzchu [K], więc klej
leży na **stronie zadrukowanej pasa klapy przedniej** (strefa `face: 'PRINT'`, wypełniona) i styka się z **wewnętrzną
stroną pasa klapy tylnej** (`face: 'REVERSE'`, tylko obrys przerywany).
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
- `Lp = 110`, `Hp = 20`, górna krawędź 20 mm pod cięciem [K] (`DIELINE_RULES.handlePatch`, `HANDLE_DEFAULTS.patch`).
  Na wąskich ściankach `Lp = min(110, W − 10)` (5 mm od bigów bocznych) [Z]. Końce uchwytu (oba typy):
  `x = W/2 ± c/2`, `c = 90 − szerokość uchwytu` [K] (`HANDLE_OUTER_WIDTH_MM = 90`); łatka wystaje 10 mm poza obrys
  rączki z każdej strony [K] (`PATCH_OVERHANG_MM`) → 90 + 2 · 10 = 110 mm. Sznurek Ø5 → c = 85 mm, taśma 20 mm →
  c = 70 mm. Pętla 50 mm nad górną krawędzią [K] (`HANDLE_LOOP_HEIGHT_MM`). Rozstaw zmniejszany tylko, gdy łatka
  jest za wąska (`W − 10 < 110`), nigdy poniżej 2 szerokości uchwytu (§5).
  Dawny wzór `Lp = min(170, W − 20)`, `Hp = 45`, `c = clamp(W/2, 75, 150)` [Z] jest wycofany.

### 9.6 Przykład: W = 200, H = 400, D = 150, s = 10 → a = 90, arkusz 710 × 490 mm

X kluczowe: 0 (wolna krawędź LEFT, szew) | 75 (środek LEFT) | 150 (LEFT|FRONT) | 250 (środek FRONT) |
350 (FRONT|RIGHT) | 425 (środek RIGHT) | 500 (RIGHT|BACK) | 600 (środek BACK) | 700 (BACK|zakładka, C3) | 710.
Skala pozioma 1 znak = 10 mm (zakładka 10 mm = kolumna `S` przy C3). Pionowa jest nieliniowa (wiersze opisane wartością Y).

```text
      Y 0      75     150                 350     425    500                  700|710
    400 #######################################################################\
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
  -12.5 #              :\                 /:              :\                 / #
    -25 #              :  \              / :              :  \              /  #
  -37.5 #  KLAPA BOKU  :   \           /   : KLAPA BOKU   :   \           /    #
    -50 #              :    \ TRAPEZ  /    :              :    \ TRAPEZ  /     #
  -62.5 #  (cala, bez  :     \       /     : (cala, bez   :     \       /      #
    -75 #   bigow)     :       \    /      :  bigow)      :       \    /       #
    -82 #              :       \   /       :              :       \   /        #
    -90 #######################################################################/
  legenda: # cięcie  : big krawędzi rękawa / zawias zakładki C3  | big środkowy fałdy  / \ bigi 45° rombu
           = big płaskiego złożenia  - linia dna  + obrys łatki (wewnątrz)  S zakładka klejowa (10 mm)
           \ / w X = 700–710: ścięcie 45° końców zakładki [K]; \ / w strefach dna przodu/tyłu: bigi 45° C9 (trapezy);
           pas kleju OV na trapezach w Y ∈ [−90, −60]; strefy dna boków bez bigów (składane w całości [K])
```

Trójkąty T nad linią dna (C6): LEFT `(0,0)–(75,75)–(150,0)`, RIGHT `(350,0)–(425,75)–(500,0)`. Pod linią dna boki są bez bigów.
C9 (E = 90): FRONT `(150,0)–(240,−90)`, `(350,0)–(260,−90)`; BACK `(500,0)–(590,−90)`, `(700,0)–(610,−90)` — trapez 200 → 20 mm.
Na zakładce: C6 `(700,0)–(710,10)`. C8 (`Y = 75`): `X ∈ [0, 75] ∪ [425, 710]`. C2/C3 w strefie dna (`Y < 0`): M.
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

- W animacji składania na płasko: jeden sztywny region `(0,0) (W,0) (W,D) (0,D)` (sklejony laminat).
- **Mozaika wg modelu klienta [K] — zaimplementowana** (`getBottomPieces`, `getVisibleBottomPieces`), `E = (D+30)/2`,
  `m = min(E, W/2)`, warstwy od zewnątrz 0…4:
  - `BACK_TRAPEZOID` (0, wierzch): `(0,0) (W,0) (W−m,m) (m,m)` ↔ BACK-local `(W − x, −y)`,
  - `BACK_EAR_RIGHT` / `BACK_EAR_LEFT` (1): odbicia uszu na trapezie tyłu ↔ BACK `(y, x − W)` / `(W − y, −x)`,
  - `FRONT_TRAPEZOID` (2): `(0,D) (W,D) (W−m,D−m) (m,D−m)` ↔ FRONT-local `(x, y − D)`,
  - `FRONT_EAR_LEFT` / `FRONT_EAR_RIGHT` (3) ↔ FRONT `(D − y, −x)` / `(W − D + y, x − W)`,
  - `SIDE_FLAP_LEFT` (4): `[0,E] × [0,D]` ↔ LEFT-local `(y, −x)`; `SIDE_FLAP_RIGHT`: `[W−E,W] × [0,D]` ↔ RIGHT `(D − y, x − W)`.
  - Widoczne od spodu: trapez tyłu, trapez przodu poza trapezem tyłu (części wypukłe), trójkąty boków
    `(0,0),(D/2,D/2),(0,D)` i lustro — kafelkują `W × D`. Krawędzie widoczne: „X” + szew `y = m`.
  - UV: każdy kawałek w ciągłej przestrzeni UV swojej ścianki (`toPanel`), więc kolory widoczne od spodu to dokładnie
    kolory wydrukowane na arkuszu (opcja `extendToBottom`).

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
| `HANDLE_WIDTH_TOO_SMALL` | uchwyt przy `W < W_min_handle` (≈180?); geometria zmniejsza rozstaw na wąskich ściankach (łatka `min(110, W − 10)`; rozstaw maleje, gdy `W − 10 < 110`, tj. W < 120) (`endSpacingReduced`, §5) | do potwierdzenia |
| `BOTTOM_TRAPEZOID_DEGENERATE` | `W ≥ D + 30` (§3.4.1) | **ostrzeżenie** (zaimplementowane: `getDimensionWarnings`, krok wymiarów UI pl/en/de; geometria degraduje łagodnie: trapez → trójkąt, bez NaN); klient nie zdecydował, czy ma być twardym limitem |

Stałe do `productCatalog.ts`: `BOTTOM_OVERLAP_MM = 30`, `BOTTOM_ALLOWANCE = (D) => (D + 30) / 2`,
`SEAM_FLAP_MM = 10` [K] (`DIELINE_RULES.glueFlapWidth`), szew na krawędzi BACK/LEFT [K], `FLAT_FOLD_PLEAT_RATIO = 0.5`.
Uchwyty [K]: `DIELINE_RULES.handlePatch = { width: 110, height: 20, topOffset: 20 }` (+ `sideClearance: 5` [Z]),
`HANDLE_OUTER_WIDTH_MM = 90`, `PATCH_OVERHANG_MM = 10`, `HANDLE_LOOP_HEIGHT_MM = 50` (§5).

### 10.8 Składanie z arkusza (oś czasu podglądu, `assemblyKinematics.ts`)

Specyfikacja klienta [K] (model dna §3.4): rękaw → boki dna do środka w całości → trapez przodu → trapez tyłu na wierzch.
Każdy kawałek jest sztywny i ma zawiasy na bigach; `q ∈ [0, 1]` od płaskiego arkusza (druk do widza) do uformowanej torby
(dokładnie poza BOX modelu §10.5, `p = 0`; test).

| Faza | `q` | Ruch |
|---|---|---|
| A rękaw | 0–0,4 | panele obracają się o 90° wokół pionowych krawędzi (FRONT nieruchomy, łańcuch RIGHT → BACK → zakładka); zakładka zamyka szew od wewnątrz pod wolną krawędzią LEFT |
| B boki | 0,4–0,6 | klapy boków (całe strefy `D × E`) 0 → 90° na linii dna; uszy przodu/tyłu obracają się o 180° na C9 (zgięte po dwusiecznej na zewnątrz), trapezy wiszą pionowo |
| C1 trapez przodu | 0,6–0,8 | trapez przodu (z uszami) 0 → 90° na dno, pod klapami boków |
| C2 trapez tyłu | 0,8–1 | trapez tyłu 0 → 90° na wierzch (klej OV) |

- Fazy są ściśle sekwencyjne (`smoothstep` w każdej); `getAssemblyAngles` = `{ tube, sides, frontTrapezoid, backTrapezoid }`.
- Kawałki: ściany, `FRONT/BACK_TRAPEZOID`, uszy `*_EAR_*_CORNER` / `*_DIAGONAL` (podział linią gięcia), `LEFT/RIGHT_SIDE_FLAP`,
  `GLUE_WALL`, `GLUE_BOTTOM` (zakładka w strefie dna, od zamknięcia rękawa przyklejona do klapy LEFT).
- Zawiasy dokładne przy każdym `q` (testy): C1, C2, C3, C9, krawędzie rękawa w strefie dna (ucho ↔ klapa boku, także przez
  szew BACK ↔ zakładka ↔ LEFT po zamknięciu rękawa) i zgięcia uszu.
- Render: offset warstw na zewnątrz od klap boków 0,1 mm/warstwę (`BOTTOM_LAYER_OFFSET_MM`, §3.4.2), zakładka 0,25 mm do
  środka LEFT; wszystko skalowane z końcem fazy A (arkusz 0 % płaski).
- **Oś czasu podglądu** (jeden suwak, SPEC §4a/§4c): `t ∈ [0; 0,4]` = składanie z arkusza (`q = t/0,4`),
  `t ∈ [0,4; 1]` = złożenie na płasko z §10.5 (`p = (t − 0,4)/0,6`). Presety: Arkusz 0, 3D pełne 0,4,
  3D po zgięciu 0,55 (`p = 0,25`), Złożona 1 — wszystkie na siatce 1 %.

---

## 11. Otwarte pytania do produkcji klienta

1. **Zakres D**: potwierdzić 40–170 mm (maszyna klasy TRIUMPH 2B/2-T8) zamiast 40–300. Jaki jest
   maks. stosunek D/W na maszynie klienta?
2. **Która maszyna i jaki zakres cut-off** (`H + (D+30)/2`)? Przy jakich minimach się zatrzymuje?
3. ~~**Szew wzdłużny**: na BACK (środek czy przesunięty)? Jaka szerokość zakładki (proponujemy 20 mm)?~~
   Rozstrzygnięte [K] (29.09.2026): szew na krawędzi rękawa BACK/LEFT, zakładka 10 mm (§9.1–9.2). Do potwierdzenia
   pozostaje tylko strona klejenia: zakładka od wewnątrz pod wolną krawędzią LEFT (nasze założenie [Z]) czy na wierzchu.
   Czy tuber klienta prowadzi szew na krawędzi (zakładka w fałdzie bocznej, podwójna warstwa w dnie po stronie LEFT)?
4. ~~**Kolejność klap dna**: czy przednia klapa jest na wierzchu?~~ Rozstrzygnięte [K] (29.09.2026): trójkąty boków do
   środka → klapa przednia na dno → **klapa tylna na wierzch**, klej na zakładce OV = 30 mm.
5. **Na którą ściankę dno kładzie się w torbie płaskiej** (zakładamy BACK, z zawiasem na przednim bigu)?
   ~~Czy big `D/2` na tyle jest bigowany na wstędze?~~ Rozstrzygnięte: tak, to linia bigowania (C8) [K].
6. **Strefy kleju dna**: tylko zakładka 30 mm, czy też uszy? Czy stosujecie łatę lub wkładkę dna?
7. **Uchwyty bez zawinięcia górnego**: czy to realny wariant produkcyjny (wytrzymałość łatki przy
   krawędzi cięcia)? Minimalne W dla uchwytów skręcanych i płaskich? Wysokość (długość) pętli?
   Rozstrzygnięte [K] (29.09.2026): uchwyt 90 mm szerokości po zewnętrznych krawędziach, pętla 50 mm nad górną
   krawędzią, łatka 110 × 20 mm (10 mm naddatku z każdej strony), 20 mm pod górną krawędzią, taśma płaska 20 mm
   (§5, §9.5). Otwarte pozostają: wytrzymałość bez zawinięcia i minimalne W dla uchwytów.
8. **Gramatura z uchwytem**: minimalna gramatura dla toreb z uchwytem (typowo ≥ 70–80 g/m²)?
9. **Nadruk**: inline na tuberze czy rola zadrukowana wcześniej (8 kolorów)? Tolerancja nadruku względem
   bigów i cięcia? Czy drukujecie zapas dna (widoczny od spodu)?
10. **Górna krawędź**: prosta czy ząbkowana? Czy jest wycięcie na kciuk?
11. ~~**Dno „krzyżowe”**: trapezy z C9 zamiast prostokątnych klap?~~ Rozstrzygnięte [K] (29.09.2026) i wdrożone (§3.4):
    boki w całości, trapezy przód/tył, tył na wierzchu. Otwarte: czy `W ≥ D + 30` ma być twardym limitem (teraz
    ostrzeżenie) oraz fizyczny sposób składania boków (analiza zewnętrzna, `docs/analysis/`).

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
