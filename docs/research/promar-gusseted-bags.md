# Torby fałdowe Promar: research (gusseted flat-bottom bags)

Stan na 2026-09-30. Autor: `paper-bag-production-expert`. Źródło główne: strona www.promarjarocin.pl, jej podstrony i PDF OWU. Źródła zewnętrzne (Garant / W&H) posłużyły tylko do objaśnienia konstrukcji i zakresów maszyn.

Dokument jest **wejściem** dla `domain-architect` i `3d-renderer` przy odblokowaniu typu `FOLDED` ("Torba fałdowa", dziś "wkrótce"). Nie zastępuje `docs/PRODUCTION.md`. Uzgodnione reguły trzeba przenieść tam po potwierdzeniu z klientem.

## 0. Legenda wiarygodności (ta sama co w PRODUCTION.md)

| Znacznik | Znaczenie |
|---|---|
| **[F]** | Fakt podany wprost na stronie / w PDF Promar (URL przy fakcie). |
| **[F-foto]** | Obserwacja ze zdjęcia produktu na stronie Promar. Pewna co do jakości, niepewna co do wymiarów. |
| **[F-M]** | Fakt z materiałów producenta maszyn (Garant, grupa W&H). Dotyczy maszyny, nie oferty Promar. |
| **[T]** | Wartość typowa w branży, nie jest to dana Promar. |
| **[Z]** | Moje założenie / wnioskowanie z praktyki produkcyjnej. Do potwierdzenia (§8). |
| **[K]** | Reguła klienta już obecna w repo (`productCatalog.ts` / PRODUCTION.md), np. krok 5 mm. |

## 1. Źródła

| # | Strona | URL |
|---|---|---|
| S1 | Torby fałdowe (kategoria) | https://www.promarjarocin.pl/torby-faldowe/ |
| S2 | ...do wyrobów cukierniczych | https://www.promarjarocin.pl/torby-faldowe/torby-faldowe-do-wyrobow-cukierniczych/ |
| S3 | ...do wyrobów piekarniczych | https://www.promarjarocin.pl/torby-faldowe/do-wyrobow-piekarniczych/ |
| S4 | ...typu Hot Dog | https://www.promarjarocin.pl/torby-faldowe/typ-hot-dog/ |
| S5 | ...płaskie ("listonoszka") | https://www.promarjarocin.pl/torby-faldowe/torby-faldowe-plaskie/ |
| S6 | ...typu Kebab | https://www.promarjarocin.pl/torby-faldowe/typ-kebab/ |
| S7 | ...do owoców | https://www.promarjarocin.pl/torby-faldowe/do-owocow/ |
| S8 | ...do warzyw | https://www.promarjarocin.pl/torby-faldowe/do-warzyw/ |
| S9 | ...do malin | https://www.promarjarocin.pl/torby-faldowe/do-owocow/maliny/ |
| S10 | ...do ciastek | https://www.promarjarocin.pl/torby-faldowe/torby-faldowe-do-ciastek/ |
| S11 | ...na pączki / rogale / słodycze | https://www.promarjarocin.pl/torby-faldowe/torby-faldowe-na-paczki/ , .../torby-faldowe-na-rogale-i-croissanty/ , .../torby-faldowe-na-slodycze/ |
| S12 | Gusset bags (EN) | https://www.promarjarocin.pl/en/gusset-bags/ |
| S13 | Ogólne warunki druku (specyfikacja plików) | https://www.promarjarocin.pl/ogolne-warunki-druku/ |
| S14 | OWU, PDF wrzesień 2026 | https://www.promarjarocin.pl/wp-content/uploads/2026/09/promar-owu-aktualizacja-wrzesien-2026.pdf |
| S15 | O firmie (park maszynowy) | https://www.promarjarocin.pl/o-firmie/ |
| M1 | Garant MATADOR NG (flat & satchel) | https://www.garant.wh.group/en/our_machines/new_machines/flat_and_satchel_bag_machines/matador_ng/ |
| M2 | Garant MATADOR NSL (flat & side gusset) | https://www.garant.wh.group/en/our_machines/new_machines/flat_and_satchel_bag_machines/matador_nsl/ |

Zdjęcia produktów (S1–S8): `https://www.promarjarocin.pl/wp-content/uploads/2024/02/{torby-do-wyrobow-piekarniczych, torby-faldowe-plaskie, torby-faldowe-typu-hot-dog, torby-faldowe-do-owocow, torby-faldowe-do-warzyw, torby-faldowe-do-kebaba}.jpg`.

## 2. Czym jest "torba fałdowa" u Promar

- Promar ma trzy rodziny toreb: **fałdowe, zakupowe i klockowe** [F, S15]. Maszyny: **Garant Maschinen** (grupa W&H) [F, S15].
- "Torba fałdowa" (EN na stronie: *gusset bag* [F, S12]) to **torebka z fałdami bocznymi (side-gusset bag) i dnem zaginanym**, a nie klockowym. W Niemczech nazywa się ją *Seitenfaltenbeutel*, w UK *bread bag / SOS-less gusset bag*. Na zdjęciach piekarniczych i warzywnych widać zagięty i sklejony pasek dna na dole ściany frontowej. Nie ma prostokątnego dna [F-foto, S3, S8].
- W konsekwencji torba **nie stoi**. Po otwarciu jej przekrój zwęża się od prostokąta `W × D` przy wylocie do linii długości `W` na dnie [Z, wynika z konstrukcji].
- Rodzina obejmuje też **torby płaskie** (bez fałd albo z "bokiem") i **rożki** (cone, popcorn) [F, S1, S5, S12]. To osobne konstrukcje.
- **Brak uchwytów** we wszystkich wariantach fałdowych [F, żadna z podstron S1–S12 ich nie wymienia]. Zgadza się to z obecnym kodem: `getSupportedHandleTypes(FOLDED) = []`.

### 2.1 Anatomia (PL / EN)

| PL | EN | Opis |
|---|---|---|
| ścianka przednia / tylna | front / back panel | `W × H`. |
| fałda boczna | side gusset | Szerokość rozłożona `D` ("fałda" w OWU [F, S14]). Złożona do środka po osi, więc z każdej strony chowa się `D/2`. |
| oś fałdy | gusset centre crease | Linia pionowa w połowie fałdy. Na płasko leży `D/2` od krawędzi torby. |
| zakładka klejowa wzdłużna | longitudinal (back) seam | Sklejenie tuby. Na zdjęciach nie rozstrzygnięto, gdzie leży (§8). |
| dno zaginane (pojedyncze / podwójne) | fold-over bottom (single / double fold) | Koniec spłaszczonej tuby zagięty o `b` i sklejony. |
| wylot, krawędź górna | mouth, top edge | Cięcie proste albo ząbkowane. Często z przesunięciem ścianek (lip / thumb cut). |
| okno podłużne / panoramiczne | longitudinal / panoramic window | Pasek folii PP/BOPP (perforowanej) albo papieru transparentnego wklejony wzdłuż frontu. |
| zapinka plastikowa | plastic clip | Akcesorium zamykające. Nie jest częścią geometrii torby. |

## 3. Warianty i zastosowania (fakty ze strony)

| Wariant | Konstrukcja | Otwarcie | Papier | Druk | Uwagi | Źródło |
|---|---|---|---|---|---|---|
| Ogólna torba fałdowa (piekarnia, cukiernia, owoce, warzywa, maliny, ciastka, pączki, rogale, słodycze) | fałdy boczne, dno zaginane [F-foto] | z jednej strony | biały lub brązowy; powlekany folią PE; **30–60 g/m²** | do **8 kolorów Pantone** | okienko PP z perforacją, "panoramiczne"; zapinka plastikowa; pakowanie w karton lub folię | S1–S3, S7–S11 |
| Hot Dog | fałdy (3 wymiary w tabeli) | **z jednej lub dwóch stron** | papier tłuszczoszczelny; opcja z PE; wariant o podwyższonej wilgocioodporności | flekso **4–8 kol.** Pantone | tabela rozmiarów §4.2 | S4 |
| Kebab | płaska, 2 wymiary | **z dwóch stron** | kraft pierwotny (virgin) lub z recyklingu; biały/brązowy tłuszczoszczelny; opcja z PE | flekso **4–8 kol.** Pantone | tabela §4.3 | S6 |
| Płaska "listonoszka" | płaska **albo z bokiem** | jednostronnie | (nie podano) | (nie podano) | wklejane okno podłużne: BOPP, BOPP perforowane albo **papier transparentny** (w pełni recyklingowalny, bez rozdzielania) | S5 |
| Rożek (popcorn, cone) | stożek | – | biały/brązowy, PE; **40–140 g/m²** | do **2 kol.** Pantone | nakład min. 50 000 szt. | S1, S12 |

Obserwacje ze zdjęć [F-foto]:
- Piekarnicze (S3) i warzywne (S8): okno jako **pionowy pas przez całą długość frontu**. Folia z mikroperforacją (kropki). Po bokach paski papieru. Na dole zagięty pasek dna, który przechodzi też przez folię. Widać przeszycie klejem albo perforację wzdłuż krawędzi paska dna.
- Piekarnicze, widok od tyłu (S3): część środkowa z folią kończy się **niżej** niż boczne pasy papieru. Wskazuje to na odsadzenie wylotu (lip / thumb cut) albo na krótszy front. Krawędź górna jest cięta prosto.
- Płaskie "cukierkowe" (S5): wzory paski / grochy, górna krawędź **najpewniej ząbkowana z odsadzeniem** (zdjęcie nieostre, więc [Z]).
- Owocowe (S7): kraft brązowy **prążkowany** (ribbed kraft) i biały, na zdjęciu bez widocznej fałdy.
- Hot dog (S4): wąskie, wysokie, papier półprzezroczysty tłuszczoszczelny. Na brązowym widać zagięte dno.

## 4. Wymiary

Konwencja nazw Promar: **szerokość × fałda × długość**. OWU podaje tolerancje "dla szerokości oraz fałdy" i osobno "dla długości torebek" [F, S14]. W modelu: `W` = szerokość, `D` = fałda (rozłożona), `H` = długość (wysokość torby gotowej). Kolejność `W×D×H` w tabeli Hot Dog to [Z], ale zgodna z nazewnictwem OWU i z proporcjami produktów.

### 4.1 Zakresy ogólne

| Parametr | Wartość | Status |
|---|---|---|
| Szerokość `W` | **100–300 mm** | [F, S1–S3, S7–S12] |
| Długość `H` | **170–670 mm** | [F, jw.] |
| Fałda `D` | **nie podano** zakresu ogólnego. Przykłady Hot Dog: 30–65 mm | [F, S4], zakres do ustalenia (§8) |
| Gramatura | **30–60 g/m²** (rożki 40–140) | [F, S1, S12] |
| "Standardowe wymiary gotowych produktów" | **180×180, 200×200, 260×260, 280×280 mm** | [F], ale przypisanie niejednoznaczne, patrz niżej |

Niejednoznaczność standardów: na S1 i S12 lista stoi **pod sekcją rożków** (EN: tuż po "machine designed to produce popcorn bags – cone type"). Na S2, S3 i S9 ta sama lista jest opisana jako rozmiary **toreb fałdowych**. Dwa równe wymiary (kwadrat) bardziej pasują do rożka albo torby płaskiej niż do torby z fałdą (brak `D`). Trzeba to potwierdzić (§8).

Porównanie z maszynami Garant [F-M]:

| Maszyna | Szer. torby | Długość odcinka (cut-off) | Maks. fałda (rozł.) |
|---|---|---|---|
| MATADOR NG (flat & satchel) | 60–380 mm | 160–760 mm | 140 mm |
| MATADOR NSL (flat & side gusset) | 60–510 mm | 105–400 mm | 140 mm |

Zakres Promar (100–300 × 170–670) mieści się w obwiedni MATADOR NG. Długość 670 wymaga cut-offu większego niż 400 mm, więc NSL odpada dla długich toreb. Nie wiadomo, jakie modele ma Promar [Z]. **Fałda ≤ 140 mm** to górna granica maszynowa, przyjęta tu jako [F-M] dla całej klasy maszyn.

### 4.2 Hot Dog: tabela rozmiarów [F, S4]

| W | D | H | D/W | Zastosowanie wg strony |
|---|---|---|---|---|
| 75 | 35 | 250 | 0,47 | hot dog, małe kanapki |
| 75 | 65 | 285 | 0,87 | większe bułki z parówką, tortille |
| 80 | 30 | 190 | 0,38 | mniejsze przekąski |
| 100 | 40 | 250 | 0,40 | uniwersalny |
| 100 | 50 | 350 | 0,50 | bagietki |
| 120 | 40 | 220 | 0,33 | większe kanapki |

Uwaga: szerokości 75 i 80 mm są **poniżej** ogólnego minimum 100 mm z S1. Zakres 100–300 dotyczy więc ogólnej torby fałdowej, a nie rodziny Hot Dog [F]. We wszystkich przykładach **D < W**, `D/W` od 0,33 do 0,87. Wszystkie wymiary są wielokrotnościami 5 mm (zgodne z `DIMENSION_STEP_MM`).

### 4.3 Kebab: tabela rozmiarów [F, S6]

| Rozmiar | Wymiar | Uwagi |
|---|---|---|
| mały | 150×155 mm | frytki, hamburger |
| średni | 160×165 mm | kebab, pieczone ziemniaki |
| duży | 170×170 mm | "najbardziej sycące dania" |

Dwa wymiary. Na zdjęciu to płaska torebka otwarta z dwóch stron (rożkowo). [Z]: `W × H`, bez fałdy. Możliwe są wymiary niestandardowe [F].

### 4.4 Tolerancje (OWU) [F, S14, rozdz. o gwarancji, pkt 4–5]

| Wielkość | Tolerancja |
|---|---|
| Ilość dostawy | ±5 % |
| Szerokość torebki | ±2 mm |
| Fałda | ±2 mm |
| Długość torebki | ±5 mm |
| Grubość materiału | ±5 % |
| Nadruk (położenie i kolor) | "ogólnie przyjęte we fleksografii tolerancje", bez liczb |

## 5. Druk, pliki i minimalne nakłady

- Do 8 kolorów Pantone dla toreb fałdowych [F, S1]. Hot Dog / Kebab: flekso 4–8 kol. [F, S4, S6]. Rożki: do 2 kol. [F, S1].
- **Minimalny nakład**: strona podaje **30 000 szt.** dla toreb fałdowych z nadrukiem [F, S1–S3, S7–S10]. OWU podaje **25 000 szt.** jako minimalną ilość zamówienia toreb fałdowych [F, S14 §8a]. To sprzeczność albo różne warunki (z nadrukiem / bez), do wyjaśnienia (§8). Rożki: 50 000 [F, S1].
- Cena ustalana indywidualnie [F]. Koszt matryc fotopolimerowych pokrywa kupujący [F, S14].
- Specyfikacja plików (dotyczy całej drukarni, nie tylko toreb fałdowych) [F, S13]:
  - PDF/X-4 (preferowany) albo PDF/X-1a, bez profili ICC i bez znaczników drukarskich (linii cięcia, paserów). Skala 1:1.
  - CMYK albo Pantone C/U (Formula Guide Solid), HKS K/N. Metaliki Pantone 871–877, neony 801–807.
  - Głęboka czerń w apli 50/40/35/100. Drobny tekst i linie tylko K100. Szarości tylko z K.
  - Minimalny font 6 pt. Minimalna linia 0,2 pt (0,07 mm) przy rastrze 100 %, więcej przy słabszych rastrach (75 %: 0,25 pt, 50 %: 0,35 pt, 25 %: 0,4 pt).
  - Bitmapy min. 300 dpi.
  - Zgodność kolorów spot ΔE2000 ≤ 3,0. CMYK na podłożu niepowlekanym ΔE2000 ≤ 3.
- **Spady (bleed) i marginesy bezpieczeństwa nie są podane** na stronie [F, S13 ich nie zawiera]. Trzeba je uzyskać od klienta (§8).

## 6. Konstrukcja i produkcja (wnioskowanie z praktyki)

Wszystko w tej sekcji to [Z] albo [T], chyba że zaznaczono inaczej.

### 6.1 Przebieg na maszynie do torebek płaskich i fałdowych (np. Garant MATADOR)

1. Rola papieru (30–60 g/m²). Druk flekso inline albo papier wstępnie zadrukowany [F-M: opcja "inline printer"; F: Promar drukuje do 8 kol. rola-rola, S15].
2. (Opcja) wycięcie okna w taśmie i wklejenie paska folii albo papieru transparentnego. Dla okna "panoramicznego" front składa się z dwóch pasów papieru i pasa folii (maszyna dwutaśmowa, *dual-web*) [F-M: "window unit", "single/dual-web"; F-foto: S3, S8].
3. Formowanie tuby. Klej wzdłużny na zakładce `s`, wkładanie fałd bocznych do środka (każda na głębokość `D/2`).
4. Odcięcie odcinka `L` (nóż prosty albo ząbkowany; opcjonalnie odsadzenie / wycięcie na kciuk).
5. **Dno**: koniec spłaszczonej tuby (wszystkie warstwy, czyli 2 w środku i 4 w strefach fałd) zagina się o `b` o 180° i skleja. Przy dnie podwójnym jest drugie zagięcie. Nie ma przekątnych 45° ani klap jak w dnie klockowym.
6. Mikroperforacja, perforacja okna, wykrawanie (opcje) [F-M].
7. Liczenie, pakowanie w karton lub folię [F, S1].

### 6.2 Wykrój (flat blank)

```
          u →   (szerokość wstęgi / obwód tuby)
 v=H+b ┌──┬───────────┬─────┬─────┬────────────────────┬─────┬─────┬───────────┐  krawędź górna (wylot)
       │s │ BACK_R    │ G_R │ G_R │       FRONT        │ G_L │ G_L │ BACK_L    │
       │  │  W/2      │ D/2 │ D/2 │         W          │ D/2 │ D/2 │  W/2      │
       │  │           ¦     ┆     ¦                    ¦     ┆     ¦           │
 v=b   ├──┼───────────┼─────┼─────┼────────────────────┼─────┼─────┼───────────┤  linia zagięcia dna (180°)
       │  │   zapas na dno b (wszystkie warstwy, zagięte na FRONT)            │
 v=0   └──┴───────────┴─────┴─────┴────────────────────┴─────┴─────┴───────────┘  cięcie
    ¦ = krawędź boczna torby (fold 180°, "dolina" od środka)
    ┆ = oś fałdy (fold 180° w przeciwną stronę, "grzbiet" od środka, czyli fałda wchodzi do wnętrza)
```

- Szerokość wykroju: `B = 2·W + 2·D + s`, gdzie `s` to zakładka klejowa, **≈ 10–15 mm** [T].
- Długość odcinka: `L = H + b` (+ `b` przy dnie podwójnym, + ewentualne odsadzenie wylotu `l`).
- Zapas na dno `b`: **≈ 15–30 mm** [T/Z]. Na zdjęciach S3/S8 pasek dna ma ok. 10–15 % szerokości frontu, ale skali brak.
- Położenie zakładki (tył, środek / bok / w fałdzie) jest nieznane. Na rysunku przyjęto środek tyłu [Z].

### 6.3 Dno zaginane i skutek dla nadruku

Kolejność warstw w spłaszczonej torbie (od frontu): FRONT → połówki fałd (w strefach bocznych) → BACK. Zagięcie końca o 180° **na front** (tak widać na zdjęciach S3/S8 [F-foto]) ma trzy skutki:

- pasek frontu `y ∈ [0, b]` (licząc od linii zagięcia) jest **zasłonięty** przyklejoną klapą. Grafika tam jest niewidoczna.
- na froncie w pasku `[0, b]` widać **zewnętrzną stronę tyłu z paska `y ∈ [−b, 0]`**, obróconą o 180°. Wzór tła "przechodzi" więc przez krawędź dna, a tekst będzie do góry nogami.
- tył gotowej torby ma widoczną wysokość `H`, zakończoną krawędzią zagięcia.

```
 przekrój boczny (spłaszczona torba), dno zaginane na front:

   FRONT  │                 BACK │
          │                      │
          │┐  ← klapa (b)        │
          ││   = warstwy BACK+G  │
          └┴─────────────────────┘  ← krawędź zagięcia = dno torby
```

### 6.4 Kształt 3D po otwarciu

- Wylot otwarty w pełni: prostokąt `W × D` (połówki fałd leżą w jednej płaszczyźnie, prostopadłe do frontu).
- Dno: linia długości `W`. Fałdy są przy dnie sklejone na płasko, więc otwarcie fałdy maleje ku dołowi do zera. Ścianki front / tył wyginają się w powierzchnię walcową (tworzące poziome), co dla papieru jest rozwijalne, więc realistyczne. Połówki fałd przy przejściu lekko się skręcają. Papier to znosi, a w renderze wystarczy przybliżenie powierzchnią prostokreślną.
- Strefa przejścia: pełne otwarcie fałdy ok. `y_r ≈ min(D, H/2)` nad dnem [Z, reguła kciuka, do dostrojenia wizualnie].

## 7. Implikacje dla konfiguratora

### 7.1 Parametry domeny (propozycja dla `domain-architect`)

| Parametr | Propozycja | Podstawa |
|---|---|---|
| `bagType` | `FOLDED` (istnieje) | kod |
| `width` W | 100–300, krok 5 | [F] zakres, [K] krok z katalogu |
| `height` H (długość) | 170–670, krok 5 | [F] |
| `depth` D (fałda rozłożona) | 20–min(W, 140), krok 5; `D = 0` jako osobny wariant "płaska"? | [Z] min; [F-M] 140; [Z] D ≤ W |
| `grammage` | 30–60 g/m² | [F]. Krok i lista gramatur nie są podane (§8) |
| `paper.color` | WHITE / BROWN | [F] |
| `paper` warianty | zwykły, powlekany PE (`moistureBarrier`), tłuszczoszczelny, kraft prążkowany, recykling | [F] S1, S4, S6; [F-foto] prążkowany |
| `handle` | zawsze `null` | [F] brak uchwytów |
| `window` (nowa encja, opcjonalna) | `NONE / FILM_PP_PERFORATED / FILM_BOPP / TRANSPARENT_PAPER`; położenie: pas pionowy na FRONT | [F] S1, S5; [F-foto] S3 |
| `bottom` | `SINGLE_FOLD` (domyślne) / `DOUBLE_FOLD`, `b` z katalogu | [Z] |
| `topEdge` | `STRAIGHT / SERRATED` (+ `lip` mm) | [F-foto] / [Z] |
| `closureClip` | bool, akcesorium (tylko cena) | [F] |
| Druk | do 8 kol. Pantone (flekso) | [F] |
| Min. nakład | 30 000 z nadrukiem (strona) albo 25 000 (OWU) | [F], konflikt |
| Tolerancje (informacyjnie w eksporcie) | W, D ±2; H ±5 mm; ilość ±5 % | [F] S14 |

### 7.2 Walidacja

1. `100 ≤ W ≤ 300`, `170 ≤ H ≤ 670`, wielokrotności 5 [F].
2. `D ≤ W` [Z], zgodne ze wszystkimi przykładami Hot Dog (maks. D/W = 0,87). `D ≤ 140` [F-M].
3. `H ≥ b + lip + D` (fałda musi zdążyć się otworzyć) [Z].
4. `30 ≤ grammage ≤ 60` [F].
5. Okno: margines papieru z każdej strony pasa okna ≥ `m_w` [Z, np. 15 mm]. Okno nie może wchodzić w fałdę ani w zakładkę. Pas może przechodzić przez linię dna (tak jest na zdjęciach).
6. `FOLDED` → `handle === null`.
7. Szerokość wstęgi `2W + 2D + s` ≤ limit maszyny (nieznany, §8).

### 7.3 Geometria dla `3d-renderer` (współrzędne lokalne paneli, origin lewy-dół, `y = 0` na linii zagięcia dna, mm)

Panele tuby (kolejność wokół obwodu, patrząc z zewnątrz, od lewej krawędzi frontu):

| Panel | x | y | Uwagi |
|---|---|---|---|
| FRONT | [0, W] | [−b, H] | `[−b, 0]` to klapa dna |
| GUSSET_R_a / _b | [0, D/2] każda | [−b, H] | oś fałdy między a i b |
| BACK | [0, W] | [−b, H] | zakładka `s` na jednej krawędzi (lub w środku) [Z] |
| GUSSET_L_a / _b | [0, D/2] każda | [−b, H] | |

Linie zagięć:
- krawędzie FRONT|GUSSET i GUSSET|BACK: pionowe `y ∈ [−b, H]`, fold 180° (płasko) → kąt otwarcia jak niżej.
- oś fałdy: pionowa, `x = D/2` w układzie fałdy, fold przeciwny.
- linia dna: pozioma `y = 0` przez cały obwód, fold 180° na FRONT (w stanie gotowym stała, a w animacji "złożenia" φ: 0 → π).
- **brak** przekątnych 45° i linii dna klockowego.

Kinematyka otwarcia, postęp `p ∈ [0, 1]` (0 = płasko, 1 = wylot otwarty):
- kąt połówki fałdy względem frontu: `α(y, p) = p · (π/2) · s(y)`, gdzie `s(y) = smoothstep(0, y_r, y)`, `y_r = min(D, H/2)` [Z].
- odsunięcie ścianki od płaszczyzny środkowej: `z(y) = ±(D/2) · sin α(y)`. Łącznie front-tył: `D · sin α`.
- oś fałdy w poziomie: `x_c(y) = (D/2) · cos α(y)` do wnętrza od krawędzi bocznej (płasko: `D/2`, otwarte: 0).
- strefa `y < b` (pod klapą dna) ma `α ≈ 0`, bo tam fałdy są sklejone.
- Opcjonalnie: górna krawędź frontu i tyłu opada o `∫ (√(1 + z'(y)²) − 1) dy` (nierozciągliwość). Wartość jest pomijalna dla `D ≪ H`.

Nadruk i UV:
- widoczne pole frontu: `y ∈ [b, H − lip]`, minus pas okna.
- pasek `[−b, 0]` tyłu pokazuje się na froncie w `[0, b]`, obrócony o 180°.
- połówki fałd są widoczne z boku tylko po otwarciu. Na płasko są schowane, a przez okno widać je od środka.

### 7.4 Materiały renderu

- 30–60 g/m² to papier cienki, półsztywny, lekko przeświecający (zwłaszcza tłuszczoszczelny / pergamin w Hot Dog). Warto dać lekką transmisję światła i miękkie, zaokrąglone zagięcia bez ostrych krawędzi [Z].
- Kraft prążkowany: tekstura z drobnymi prążkami wzdłuż kierunku maszynowego [F-foto, S7].
- Okno: folia PP z mikroperforacją (siatka kropek) albo papier transparentny (matowy, mleczny) [F, F-foto].

## 8. Pytania otwarte do klienta (produkcja Promar)

1. Do czego należą "standardowe wymiary 180×180, 200×200, 260×260, 280×280": do toreb fałdowych, płaskich czy do rożków? Który to wymiar (W×H czy inny)?
2. Jaki jest zakres fałdy `D` dla toreb fałdowych (min / max), jaki krok i czy obowiązuje `D ≤ W`? Czy "torba płaska" (D = 0) ma być w konfiguratorze osobnym typem?
3. Minimalny nakład: 30 000 (strona) czy 25 000 (OWU)? Czy 25 000 dotyczy toreb bez nadruku?
4. Wysokość zagięcia dna `b`: dno pojedyncze czy podwójne i na którą ścianę zagięte? Czy stosujecie klej, zgrzew czy perforację klejową (widoczna linia na zdjęciach)?
5. Wylot: cięcie proste czy ząbkowane? Czy jest odsadzenie (lip) albo wycięcie na kciuk, i jakiej wielkości?
6. Gdzie leży zakładka klejowa wzdłużna i jaka jest jej szerokość `s`?
7. Okno: dostępne szerokości i położenie pasa, minimalny margines papieru, czy okno przechodzi przez dno. Czy okno na torbach płaskich jest jedyną opcją z papierem transparentnym?
8. Lista gramatur w zakresie 30–60 (np. 32, 35, 40, 45, 50, 60?) i które papiery (PE, tłuszczoszczelny, prążkowany, recykling) są dostępne dla których wariantów.
9. Spady i marginesy bezpieczeństwa dla plików do toreb fałdowych. Czy druk obejmuje fałdy i klapę dna?
10. Maksymalna szerokość wstęgi i długość odcinka używanych maszyn (który model Garant)?
11. Czy warianty Hot Dog / Kebab (otwarcie z dwóch stron, szerokość < 100 mm) mają wejść do konfiguratora, czy tylko ogólna torba fałdowa?
12. Czy zapinka plastikowa i pakowanie (karton / folia) mają być opcjami w konfiguratorze (wpływ tylko na cenę)?
