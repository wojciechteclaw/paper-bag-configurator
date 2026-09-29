# Analiza: geometria dna torby klockowej (SOS) i warunek `W ≥ D + 30`

Dokument do samodzielnej analizy (bez dostępu do kodu). Cel: sprawdzić, czy przyjęty model składania dna jest
fizycznie poprawny, i ustalić właściwe wzory oraz ograniczenia wymiarów. Klient ma wątpliwości („coś mi tu nie gra”).

## 1. Oznaczenia i jednostki

Wszystkie wymiary w mm.

| Symbol | Znaczenie | Przykład |
|---|---|---|
| `W` | szerokość torby (przód / tył) | 200 |
| `D` | głębokość torby (boki / fałdy boczne) | 150 |
| `H` | wysokość ścianki (od linii dna do górnej krawędzi) | 400 |
| `OV` | zakład klejenia klap dna | 30 |
| `E` | zapas na dno pod każdą ścianką, `E = (D + OV) / 2` | 90 |

Zależność klienta: `OV = 2E − D`, czyli `E = (D + 30) / 2`. Zapas `E` jest taki sam pod każdą z czterech ścianek.

Obecnie obowiązujące ograniczenie wymiarów w konfiguratorze: `D ≤ W` (szerokość zawsze ≥ głębokość), krok 5 mm,
szerokość 75–450, wysokość 170–470, głębokość 40–300.

## 2. Wykrój (arkusz płaski)

Kolejność paneli wzdłuż arkusza (decyzja klienta):

```text
[ LEWY D ][ PRZÓD W ][ PRAWY D ][ TYŁ W ][ zakładka klejowa 10 mm, skosy 45° na końcach ]
```

- Szew rękawa na krawędzi TYŁ / LEWY.
- Wysokość arkusza `H + E`; pas `E` pod linią dna to strefa dna.
- Dla 200 × 400 × 150: arkusz 710 × 490.

## 3. Model składania dna (wytyczne klienta, obecnie wdrażane)

1. **Boki (LEWY, PRAWY):** cała strefa dna boku (prostokąt `D × E`) zagina się w całości o 90° na linii dna.
   Brak skosów w strefie dna boków.
2. **Przód i tył:** strefa dna (`W × E`) ma dwa bigi 45° z narożników linii dna: `(0, 0) → (E, E)` i `(W, 0) → (W − E, E)`
   (x wzdłuż szerokości, y od linii dna w głąb strefy). Powstaje trapez: `W` przy linii dna, `W − 2E` na końcu strefy.
   Narożne trójkąty (poza skosami) są połączone z bokami przez pionowe krawędzie rękawa i chowają się między bokiem
   a trapezem.
3. **Kolejność i warstwy (od środka torby na zewnątrz):** boki (z narożnymi trójkątami) → trapez przedni → trapez tylny
   (na wierzchu, klejony do przedniego na zakładce `OV = 30`).

## 4. Skąd się bierze warunek `W ≥ D + 30`

**Boki.** Każdy bok po zagięciu o 90° wchodzi w dno na głębokość `E`, licząc od swojej krawędzi (w kierunku szerokości `W`).
Oba boki razem zajmują `2E = D + 30`. Jeśli `W < D + 30`, boki zachodzą na siebie na środku dna.

**Trapezy.** Skosy 45° dochodzą do końca strefy w `x = E` i `x = W − E`. Szerokość trapezu na końcu: `W − 2E = W − (D + 30)`.

- `> 0`: trapez,
- `= 0`: trójkąt (granica),
- `< 0`: skosy krzyżują się przed końcem strefy, narożne trójkąty nachodzą na siebie.

Przykłady dla `D = 150` (`E = 90`, `2E = 180`):

| W | koniec trapezu `W − 180` | wynik |
|---|---|---|
| 250 | 70 | trapez |
| 200 | 20 | wąski trapez |
| 180 | 0 | trójkąt (granica) |
| 150 | −30 | boki zachodzą o 30 mm, skosy się krzyżują |

Wniosek z tego modelu: przy `D ≤ W` (obecna blokada) dopuszczamy wymiary, dla których dna nie da się złożyć zgodnie
z wytycznymi. Trzeba albo zaostrzyć blokadę do `D ≤ W − 30`, albo model jest błędny.

## 5. Dlaczego „coś nie gra” — hipotezy do sprawdzenia

1. **Standardowe dno SOS (model wcześniejszy):** boki NIE zaginają się w całości. Strefa dna boku ma „romb”: dwa bigi 45°
   z dolnych narożników boku do punktu `(D/2, D/2)`; bok tworzy trójkąt o podstawie `D` i wierzchołku w głąb na `D/2`.
   Wtedy boki zajmują łącznie `D/2 + D/2 = D` szerokości dna, więc wystarcza `D ≤ W`. Klapy przód/tył to prostokąty
   `W × E`, zachodzące na `OV = 30`. Pytanie: czy wytyczne klienta („boki zaginają się CAŁE”) opisują to samo dno innymi
   słowami (np. „cały bok” = cały trójkąt), czy inną konstrukcję?
2. **Skosy 45° na przodzie/tyle:** w standardowym SOS widoczne od spodu „X” / skosy są krawędziami trójkątów bocznych
   i klap, a nie osobnymi bigami na klapach przód/tył. Czy klient widzi te same linie, tylko przypisuje je innym panelom?
3. **Zapas `E`:** czy `E = (D + 30) / 2` jest stały dla wszystkich rozmiarów, czy dla wąskich toreb zapas jest mniejszy?
   Jeśli `E` zależy od `W`, warunek może zniknąć.
4. **Narożne trójkąty:** przy modelu z pkt 3 ich los (zagięcie o 180°? schowanie pod trapez?) nie wynika jednoznacznie
   z wytycznych; model sztywnych paneli dopuszcza tylko jeden z dwóch skosów w narożniku.

> **Decyzja klienta (29.09.2026):** zapas na dno pozostaje branżowy — `E = (D + 30) / 2`. Propozycja `E = W / 2`
> (sekcja 5a) jest odrzucona. Otwarte pozostaje tylko to, jak składają się boki w dnie (pełny prostokąt vs trójkąt,
> sekcja 5 pkt 1) i wynikające z tego ograniczenie wymiarów.

## 5a. Propozycja klienta: zapas na dno `E = W / 2` (odrzucona)

Idea: zapas równy połowie szerokości, żeby zagięte boki zawsze domykały się na środku dna.

Założenie: rękaw cięty prosto, więc zapas jest jednakowy pod wszystkimi czterema ściankami (inny zapas dla boków
wymagałby wycinania strefy dna wykrojnikiem).

| | `E = (D + 30) / 2` (obecnie) | `E = W / 2` (propozycja) |
|---|---|---|
| boki po zagięciu | razem `D + 30` — przy wąskich torbach zachodzą na siebie | razem dokładnie `W` — zawsze domykają się na środku |
| przód / tył | trapezy, koniec o szerokości `W − D − 30` | skosy 45° spotykają się w punkcie → zawsze trójkąty |
| zakład klejenia przód–tył | stały 30 mm | `2E − D = W − D`, zmienny |
| wymagane ograniczenie | `W ≥ D + 30` | `W ≥ D` (= obecna blokada) |
| papier na dno dla 200 × 400 × 150 | 90 mm | 100 mm |

Do sprawdzenia:

1. Przy `W = D` zakład klejenia wynosi 0 → brak miejsca na klej; potrzebny minimalny zakład (np. `W ≥ D + 20`).
2. Klapy przód/tył stają się trójkątami (zmienia się wygląd dna od spodu i widoczny zadruk).
3. Większe zużycie papieru przy szerokich torbach (W = 450 → zapas 225 mm).

Wariant pośredni: `E = max((D + 30) / 2, W / 2)` — boki zawsze się domykają, zakład nigdy nie spada poniżej 30 mm,
kosztem papieru przy szerokich torbach.

Pytanie do produkcji: czy strefa dna jest cięta prosto (jednakowy zapas), czy wykrojnikiem (różne zapasy boków i przodu/tyłu)?

## 6. Pytania do produkcji / pomiar prawdziwej torby

Najlepiej na wąskiej torbie (szerokość zbliżona do głębokości) i na standardowej (np. 200 × 400 × 150):

1. Wymiary `W`, `D`, `H` i faktyczny zapas pod linią dna na przodzie i na boku.
2. W złożonym dnie: czy lewy i prawy bok leżą płasko na całej głębokości zapasu, czy tworzą trójkąt? Czy nachodzą na siebie?
3. Jaka jest szerokość trapezu przedniego na jego końcu? Czy skosy są dokładnie pod 45° i na którym panelu leżą bigi?
4. Kolejność warstw widoczna od spodu (co jest na wierzchu, gdzie jest klej).
5. Zdjęcia: złożone dno od spodu oraz rozłożona strefa dna na arkuszu (z widocznymi bigami).

## 7. Oczekiwany wynik analizy

- Który model (pkt 3 czy pkt 5.1) odpowiada rzeczywistej produkcji, z uzasadnieniem.
- Poprawne wzory: bigi w strefie dna każdego panelu (współrzędne), kształty elementów po złożeniu, kolejność warstw.
- Właściwe ograniczenie wymiarów (`D ≤ W`, `D ≤ W − 30` albo inne) i czy ma być blokadą, czy ostrzeżeniem.
- Ewentualna korekta wzoru na zapas `E`.
