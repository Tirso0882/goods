# Product competition in Polish online retail: 15 categories

Research date: 28 September 2026. All sources were accessed on 2026-09-28. Question: for each category, how crowded is it in Polish online retail, what are typical price levels, and where could a small seller stand out?

## Summary

- **Allegro commission** runs from about 5.5% (power tools, capped at PLN 120) to 15% (cheap phone accessories under PLN 60). Most categories sit at 8% to 11.5% net. Fashion, jewelry and electronics accessories use a sliding scale that falls above PLN 110 or PLN 60. Handicraft supplies pay a flat 14% at any price, the highest flat rate of the 15. The per-category rate list says the rates apply from 2 March 2026.[^fee-list]
- **Most crowded (judgement):** supplements, books, electronics accessories and pet food. On Ceneo, the most popular products in these categories are each sold by a median of 18 to 35 shops, so buyers compare identical items on price. The Allegro phone-case category holds about 4.36 million offers.[^al-etui]
- **Brand-led (judgement):** power tools (DeWalt, Bosch, Makita), laundry and dishwasher chemicals (Ariel, Finish, Fairy), dolls (Mattel), dog food (Brit) and branded jewelry (Swarovski, Pandora). A small seller cannot win on the same products.
- **Least crowded (judgement):** home and garden, furniture, pet accessories (beds, scratchers), car organizers, craft supplies. Here the popular products are mostly listed by 1 to 3 shops each, and brands are scattered.
- **Seasonality** is strongest for bikes (May is about 4x December), toys (November is about 3x June), yarn (November about 2.7x June) and garden (April about 1.9x December). Pet food, chargers and tools are nearly flat.
- **Fastest-rising search terms** over 5 years: "listki do prania" (laundry sheets, about 23x), "padel" (about 13x), "klocki magnetyczne" (magnetic blocks, about 5x), "kosmetyki koreańskie" (about 3.4x), "magsafe" (about 3x), "grządka podwyższona" (raised beds, about 2.3x) and "kreatyna" (about 2.2x).
- **Biggest gap:** Allegro blocked automated access after a few pages. I got Allegro bestseller data for only 3 listings (dresses, phone cases, padel). For the other 12 categories, the price and brand points come from Ceneo.

## Method and limits

**What worked**

- **Allegro commission tables.** I read the official fee annex, Załącznik nr 4 (Opłaty i prowizje), on policies.allegro.com.[^fee-annex] I also read the official per-category rate list, which states "Stawki prowizji obowiązują od 2.03.2026 roku".[^fee-list] The help-center fee page gives the headline range per top category.[^fee-help] All rates below are net, before 23% VAT. The fee is charged on the item price plus the delivery cost the buyer picks, and the minimum is PLN 0.40 per item.[^fee-annex] I found a second copy of the annex on the same site.[^fee-annex2] Its commission rows match the first copy. Neither copy shows its own effective date, so I use the 2 March 2026 date from the rate list.
- **Ceneo.** The category and search pages loaded fine. I sorted each one by "popularność: największa" (the `;0115-1.htm` URL suffix) and parsed the first page of about 30 products. Ceneo's default "rekomendowane" sort puts paid bids first, so I did not use it. For each product I recorded the lowest price ("od X zł"), the number of shops ("w N sklepach"), the brand, and Ceneo's "kupionych ostatnio" count (units bought in the last 90 days). The "typical price" I quote is the middle half of these prices (25th to 75th percentile). For fashion and jewelry, Ceneo lists single-shop offers, not compared products. For those categories the shop count is always 1 and tells you nothing.
- **Google Trends, Poland, last 5 years** (2021-09-26 to 2026-09-27, weekly). The web page did not render. The `trends/api/explore` and `widgetdata/multiline` endpoints did work once I had a session cookie. For each term I compute a **monthly index**: the average of all weeks in that calendar month, divided by the 5-year average. So 1.50 means that month runs 50% above normal. I also report the **5-year change**: the last 52 weeks divided by the first 52 weeks. Each term is scaled on its own, so you can compare seasonal shape between terms but not search volume. Terms with low volume (for example "grządka podwyższona") have many zero weeks, which makes their ratios noisy.

**What did not work, or only partly**

- **Allegro listings and bestsellers.** WebFetch returned empty pages or timed out. A desktop curl request got HTTP 403. A mobile user agent worked for about 3 pages, then Allegro returned 429 and 403 for everything, and was still blocking when I finished. The pages I did get: the women's dresses category (124264), the phone cases category (353), and a search for "padel". All three were sorted by "popularność: największa" (`order=qd`). The URL allegro.pl/bestsellery returns 404. So for 12 of 15 categories I could **not** check Allegro prices, official-store share, or Super Sprzedawca share. In those categories, "Allegro: not verified" means exactly that.
- **Allegro Brand Zone.** In Allegro's listing data, an ordinary company with a logo carries a `brandzone` field too. I count a seller as an official store only when its title is exactly "Oficjalny sklep".
- **Household chemicals commission.** The rate list I have does not cover the Supermarket, Uroda, Zdrowie or Sport i turystyka branches. I took their rates from the annex text instead. The annex text does not say which branch holds cleaning products, so the household chemicals rate is marked unverified.
- **Offer counts on Ceneo.** Ceneo does not show a total product count on its category pages. I use shops per product and the number of distinct brands as proxies for competition.

All competition ratings and niche picks are my judgement, based on the numbers above.

## 1. Clothing and footwear

- **Commission:** 11.5% up to PLN 110. Above that, PLN 12.65 plus 7.5% of the part over PLN 110. The same rule covers Odzież and Obuwie.[^fee-annex] A PLN 200 item pays PLN 19.40, which is 9.7%.[^fee-help]
- **Typical bestseller price:** On Allegro, the 30 most popular organic dress offers run PLN 101 to 140 (median 130, range 14 to 249). The category holds 763,425 offers.[^al-dress] Ceneo dresses: PLN 80 to 205, median 128.[^c-dress] Ceneo women's shoes: PLN 159 to 456, median 237.[^c-shoes]
- **Big brands or official stores?** Not on Allegro dresses. The top 30 had 0 official stores, but 25 of 30 came from Super Sprzedawca accounts. There were 13 distinct sellers, and the biggest (AWANTI-sklep) had 7 of the 30 slots. The top offer showed "196 osób kupiło ostatnio".[^al-dress] On Ceneo, Reserved held 36 of the 80 dress offers.[^c-dress] Ceneo shoes are spread over 44 brands (Crocs 12, adidas 9, Salewa 9, Nike 8 of 126).[^c-shoes]
- **Seasonality:** "odzież" peaks in November (1.20), October (1.18) and January (1.10). It bottoms out in July (0.84) and June (0.86), a peak-to-trough ratio of 1.43. It is down to 0.72 over 5 years. "buty" peaks in March (1.19) and November (1.14) and bottoms out in July (0.83), ratio 1.43, flat over 5 years (0.99).[^t-cloth]
- **Niche: linen dresses ("sukienka lniana").** Search interest is very seasonal: June 3.18, July 2.45, May 1.84, and almost zero in November. It is up 1.22x over 5 years.[^t-niche] On Ceneo, the top 30 cost PLN 100 to 179 (median 160). Reserved holds 15 of the 30 and the rest are scattered, each sold by one shop.[^c-linen] Allegro: not verified.
- **Judgement:** Crowded (high). The Allegro top list is made up of mid-sized Polish sellers with Super Sprzedawca status, not big brands. That is good news for a newcomer, but these sellers are established. Linen dresses in the PLN 100 to 180 band, stocked from April for a May to July peak, look like a workable seasonal entry.

## 2. Home and garden

- **Commission:** Dom i Ogród is 11% by default. Most of the Ogród branch (and Doniczki i osłonki) is 10%, capped at PLN 250. Mowers, grills and "Narzędzia" power tools are 5.5%, capped at PLN 120.[^fee-annex][^fee-list]
- **Typical bestseller price:** Ceneo Ogród: PLN 74 to 1,024, median 286. The spread is wide, from PLN 24 solar lanterns to robot mowers.[^c-garden] Ceneo pots and planters: PLN 38 to 100, median 53.[^c-pots] Allegro: not verified.
- **Big brands?** Mixed. The Ogród top 30 had 24 brands, with no brand above 3 products (Makita had 3).[^c-garden] Pots are the exception: Prosperplast held 20 of the top 30.[^c-pots]
- **Seasonality:** "ogród" peaks in April (1.46) and May (1.40). It bottoms out in December (0.76), September (0.81) and January (0.83), ratio 1.91. It is down to 0.75 over 5 years.[^t-home]
- **Niche: raised garden beds ("grządka podwyższona").** Search interest is up 2.29x over 5 years. It peaks in April (3.99), March (3.81) and May (3.24) and is near zero from July to January (low volume).[^t-niche] On Ceneo, the top 30 cost PLN 183 to 708 (median 234). Each is sold by a median of 1 shop, and 7 of the 30 have no brand.[^c-beds] Allegro: not verified.
- **Judgement:** Medium competition. Buyers here search by product type rather than by brand, except for pots. Raised beds are bulky, which keeps casual sellers out. The short spring window means stock must land by March.

## 3. Furniture and home decor

- **Commission:** Meble is 9%, capped at PLN 250 per item. Home textiles such as Koce i narzuty are 11%. Meble "Pozostałe" (other) is 17%.[^fee-annex][^fee-list]
- **Typical bestseller price:** Ceneo coffee tables: PLN 132 to 520, median 249.[^c-tables] Ceneo blankets and throws: PLN 42 to 97, median 75.[^c-blankets] Allegro: not verified.
- **Big brands?** Moderate. Halmar held 10 of the top 30 coffee tables, with 17 brands in total, and each table is sold by a median of 3 shops.[^c-tables] Eurofirany held 15 of the top 30 blankets.[^c-blankets]
- **Seasonality:** "meble" peaks in November (1.16), January (1.10) and October (1.09). It bottoms out in June (0.84) and May (0.88), ratio 1.39. It is down to 0.73 over 5 years.[^t-home]
- **Niche: plant stands ("kwietnik", "stojak na kwiaty").** On Ceneo, the top 30 cost PLN 71 to 137 (median 99). There are 19 brands, and each product is sold by a median of 1 shop.[^c-stands] The rate is 10% capped at PLN 250 under Ogród, or 11% under Wyposażenie / Florystyka.[^fee-list] The downside: "kwietnik" searches are down to 0.60 over 5 years (peak March and April at 1.20, trough December at 0.70).[^t-niche]
- **Judgement:** Medium competition. The 9% capped rate suits higher-priced furniture. Search interest in the whole category is falling, so I would treat plant stands as a small add-on line, not a main bet.

## 4. Consumer electronics accessories

- **Commission:** Chargers, cases, power banks, cables and GSM accessories pay 15% up to PLN 60. Above that, PLN 9 plus 8% of the part over PLN 60.[^fee-annex][^fee-list] So a PLN 25 case pays 15%, and a PLN 100 charger pays PLN 12.20 (12.2%).
- **Typical bestseller price:** On Allegro, the 30 most popular organic phone cases cost PLN 15 to 29 (median 22). The category has 4,362,175 offers.[^al-etui] Ceneo chargers: PLN 59 to 145, median 89.[^c-chargers] Ceneo power banks: PLN 85 to 195, median 139.[^c-powerbanks] Ceneo's case list is skewed toward Apple's own cases (17 of 30, median PLN 144), so it is not a good guide to the mass market.[^c-cases]
- **Big brands or official stores?** On Allegro cases: 0 of 30 official stores, 27 of 30 Super Sprzedawca, 20 distinct sellers, and no seller above 5 of the 30. The top offer showed "804 osób kupiło ostatnio".[^al-etui] On Ceneo, chargers are branded (Samsung 6, Xiaomi 5, Apple, Ugreen and Baseus 3 each of 31), with a median of 19 shops per product.[^c-chargers] Power banks: Baseus 12 of 30.[^c-powerbanks]
- **Seasonality:** "ładowarka" peaks in December (1.14) and January (1.05), and is flat the rest of the year (about 0.95), ratio 1.20. It is up 1.18x over 5 years. "etui na telefon" peaks in December (1.22) and July (1.12) and bottoms out in March (0.86), ratio 1.42. It is down to 0.69 over 5 years.[^t-elec]
- **Niche: MagSafe accessories.** "magsafe" searches are up 3.08x over 5 years, peaking in December (1.26) and September (1.17, around iPhone launches).[^t-niche] On Ceneo, "etui magsafe" products cost PLN 69 to 129 (median 99), spread over 18 brands, with a median of 2 shops per product.[^c-magsafe] But MagSafe cases already hold 3 of the top 6 Allegro case slots.[^al-etui]
- **Judgement:** Very crowded (very high). Prices are low, the top rate is high, and millions of offers compete. If you enter, sell MagSafe add-ons (stands, wallets, car mounts) at PLN 60 or more, where the rate drops to 8% on the part above PLN 60. Do not start with plain cases.

## 5. Beauty and cosmetics

- **Commission:** Uroda is 10% by default. Pielęgnacja (skin care), Perfumy i wody, and Urządzenia are 8%. Dermokosmetyki under Zdrowie is 6%.[^fee-annex]
- **Typical bestseller price:** Ceneo face creams: PLN 37 to 85, median 58.[^c-creams] Ceneo face serums: PLN 40 to 125, median 59.[^c-serums] Allegro: not verified.
- **Big brands?** Brands are spread out (23 brands in the top 30 creams, 19 in serums), but each product is stocked by many shops. Creams have a median of 13 shops per product, and one serum has 47.[^c-creams][^c-serums] Korean brands are prominent: Beauty of Joseon, Centellian24, Dr.Althea, Skin1004 and Celimax. One Bielenda cream shows 843 units bought in 90 days.[^c-creams]
- **Seasonality:** "kosmetyki" peaks in December (1.31) and November (1.25), the gift season. It bottoms out in June (0.86), ratio 1.51, and is flat over 5 years (0.95).[^t-beauty]
- **Niche: Korean skin care.** "kosmetyki koreańskie" searches are up 3.41x over 5 years, peaking in January (1.20) and February (1.13).[^t-niche] Korean brands already appear in the Ceneo top 30.[^c-creams]
- **Judgement:** Crowded (high). Top products carry the same barcode everywhere, so price wins. Selling the best-known Korean brands puts you into that price fight. A small seller would need less common Korean brands, or curated routines and sets that do not line up one-to-one with Ceneo listings.

## 6. Health and dietary supplements

- **Commission:** Zdrowie is 10.5% by default. Supplements listed under Sport i turystyka ("Suplementy i Odżywki") are 8.5%, capped at PLN 140. Leki bez recepty (OTC medicines) are 1%.[^fee-annex] On the help page, the Zdrowie range is 1% to 13%.[^fee-help]
- **Typical bestseller price:** Ceneo Odżywki i suplementy: PLN 54 to 119, median 67.[^c-supps] Ceneo vitamins and minerals: PLN 34 to 69, median 45.[^c-vits] Allegro: not verified.
- **Big brands?** Brand-led and heavily shared. Vitamin products have a median of 35 shops each (up to 67). Olimp holds 7 of the top 30 supplements.[^c-supps][^c-vits] These two lists have the highest 90-day unit counts I saw: 20,398 for vitamins and 12,545 for supplements.[^c-vits][^c-supps]
- **Seasonality:** "suplementy" peaks in January (1.18), February (1.13) and March (1.09), and bottoms out in June (0.90), ratio 1.32. It is up 1.48x over 5 years.[^t-health]
- **Niche: creatine ("kreatyna").** Searches are up 2.17x over 5 years, peaking from January to March.[^t-niche] On Ceneo, creatine costs PLN 39 to 98 (median 52), with a median of 8 shops per product, led by Olimp 7, Trec 4 and Ostrovit 4.[^c-creatine]
- **Judgement:** Very crowded (very high) for reselling known brands. Demand is large and growing, but the top products are sold by dozens of shops. The realistic route is your own label (for example, creatine aimed at women or older adults). That route brings product registration duties, which I did not verify.

## 7. Sports and outdoor

- **Commission:** Sport i turystyka is 11.5% by default. Siłownia i fitness (gym and fitness) is 10.5%, capped at PLN 120. Bikes, scooters and trainers are 8%, capped at PLN 120. Electronics, optics, supplements and winter sports are 8.5%, capped at PLN 140.[^fee-annex]
- **Typical bestseller price:** Ceneo tents: PLN 304 to 1,750, median 445.[^c-tents] Ceneo dumbbells: PLN 102 to 434, median 270.[^c-dumbbells] Ceneo bikes: PLN 1,300 to 3,847, median 2,750.[^c-bikes] Allegro: not verified, apart from the padel search below.
- **Big brands?** Moderate. Tents are spread over 16 brands with a median of 2 shops each.[^c-tents] Bikes are led by Polish brands (Indiana 9, Romet 7, Kross 5 of 32).[^c-bikes] Dumbbells: XTREXO 8 and Rebel 6 of 31.[^c-dumbbells]
- **Seasonality:** "rower" is the most seasonal term I checked. It peaks in May (1.65), April (1.55) and June (1.45) and bottoms out in December (0.40), a ratio of 4.15. It is up 1.09x over 5 years.[^t-sport]
- **Niche: padel accessories.** "padel" searches are up 13.4x over 5 years. They peak in August (1.32) and June (1.22) and bottom out in October (0.71).[^t-niche] An Allegro search for "padel" returns 7,371 offers, against 4.36 million in phone cases. In its top 30, 7 slots belong to official stores (5 of them Decathlon), 18 are Super Sprzedawca, and 21 sellers are distinct. The median price is PLN 44 (grips, balls, beach bats), with a 75th percentile of PLN 252.[^al-padel][^al-etui] Ceneo rackets cost PLN 295 to 699 (median 411), led by Head, NOX, Siux and Babolat.[^c-padel]
- **Judgement:** Medium competition overall. Rackets are brand-led. Padel accessories (grips, protectors, bags, ball holders) are a small but fast-growing space, with a rate of 10.5% to 11.5%.

## 8. Toys and baby products

- **Commission:** Dziecko is 11.5% by default. Klocki (building blocks, not LEGO) is 8%, and Klocki / Magnetyczne is 8%. LEGO is 5%. Lalki (dolls) are 9%. Strollers and car seats are 8%.[^fee-annex][^fee-list]
- **Typical bestseller price:** Ceneo blocks: PLN 69 to 196, median 110.[^c-blocks] Ceneo dolls: PLN 102 to 170, median 135.[^c-dolls] Allegro: not verified.
- **Big brands?** Dolls, yes: Mattel holds 19 of the top 31 (plus 5 under the Barbie name), led by "KPop Demon Hunters" figures.[^c-dolls] Blocks are more mixed: 13 brands, with Mattel Brick Shop 7, Playmobil 5 and Cada 4.[^c-blocks]
- **Seasonality:** "zabawki" peaks in November (2.08) and December (1.72) and bottoms out in June (0.70), a ratio of 2.97. It is down to 0.76 over 5 years. "klocki" peaks in November (1.74) and December (1.60), ratio 2.19, and is up 1.36x over 5 years.[^t-toys]
- **Niche: magnetic building blocks ("klocki magnetyczne").** Searches are up 5.36x over 5 years, peaking in November (2.78) and December (2.53).[^t-niche] On Ceneo, the top 31 cost PLN 85 to 137 (median 112). There are 20 brands (Doris 5, Magna-Tiles 3, Connetix 3), with a median of 3 shops per product.[^c-magblocks] The rate is 8%.[^fee-list]
- **Judgement:** Crowded (high) in dolls and licensed toys, medium in generic blocks. Magnetic blocks combine growing demand, scattered brands and a lower 8% rate. Plan the stock around October to December, when most of the year's demand lands.

## 9. Pet supplies

- **Commission:** Dog and cat food and treats ("Karmy" and "Smakołyki" under Supermarket) pay 6%.[^fee-annex] Other Supermarket items pay 10.5% by default. Pet accessories may instead fall under the 13%/8% "Akcesoria" row. I could not confirm which rate applies to beds or leashes.
- **Typical bestseller price:** Ceneo dog food: PLN 105 to 170, median 160, mostly 12 to 15 kg bags.[^c-dogfood] Ceneo leashes: median PLN 54.[^c-leash] Ceneo cat scratchers: PLN 81 to 421, median 197.[^c-scratch] Ceneo dog beds: PLN 59 to 201, median 133.[^c-dogbeds] Allegro: not verified.
- **Big brands?** Food, yes: Brit holds 20 of the top 31, with a median of 23 shops per product.[^c-dogfood] Leashes: Flexi holds 22 of 30.[^c-leash] Beds and scratchers are scattered: 20 brands in the top 30 beds, with a median of 1 shop per product, and 11 brands in scratchers.[^c-dogbeds][^c-scratch]
- **Seasonality:** "karma dla psa" is almost flat. Its highest month is January (1.11) and its lowest is June (0.91), ratio 1.22. It is up 1.19x over 5 years.[^t-pet]
- **Niche: dog beds ("legowisko dla psa").** Searches peak in November (1.34), December (1.30) and January (1.13) and bottom out in June (0.72). They are down slightly over 5 years (0.92).[^t-niche] The Ceneo evidence of scattered sellers is above.[^c-dogbeds]
- **Judgement:** Food is very crowded and price-driven, despite the low 6% rate. Accessories are medium. Beds are bulky and come in many sizes, which suits a small seller who can offer custom sizes or washable covers.

## 10. Car parts and accessories

- **Commission:** Motoryzacja is 9%, capped at PLN 140, for items marked new. Used items pay 16%, capped at PLN 140. Engine oil, car vacuums and similar pay 6%, capped at PLN 120. Tyres and rims pay 4.5%, capped at PLN 120.[^fee-annex][^fee-list]
- **Typical bestseller price:** Ceneo Motoryzacja: PLN 132 to 414, median 210.[^c-moto] Ceneo engine oil: PLN 124 to 189, median 166.[^c-oil] Ceneo dashcams: PLN 321 to 684, median 426.[^c-dashcam] Allegro: not verified.
- **Big brands?** Oil is spread over 19 brands, with a median of 3 shops per product.[^c-oil] Dashcams are dominated by 70mai (19 of 30).[^c-dashcam]
- **Seasonality:** "części samochodowe" peaks in February (1.28) and bottoms out in December (0.90), ratio 1.42. It is down to 0.83 over 5 years.[^t-car]
- **Niche: trunk organizers ("organizer do bagażnika").** Searches are up 1.64x over 5 years. They peak in December (1.52, gifts) and June (1.31, holiday trips) and bottom out in October (0.56).[^t-niche] On Ceneo, the top 30 cost PLN 28 to 60 (median 40). They are spread over 23 brands, with a median of 2 shops per product.[^c-organizer]
- **Judgement:** Medium competition. Spare parts need fitment data and returns handling, which is hard for a newcomer. Accessories such as organizers are scattered and do not depend on fitment. The low median price (PLN 40) means shipping cost matters.

## 11. Books and media

- **Commission:** Kultura i rozrywka is 8.5% by default, including Książki / Literatura piękna, Poradniki i albumy, and Notesy, planery. School textbooks, ebooks and mp3 audiobooks are 5%.[^fee-annex][^fee-list]
- **Typical bestseller price:** Ceneo Księgarnia (bookstore): PLN 45 to 57, median 53.[^c-books] Ceneo psychology self-help: PLN 32 to 49, median 37.[^c-selfhelp] Allegro: not verified.
- **Big brands?** There are no brands as such, but every title is sold by many shops: a median of 18 per title in the bookstore list and 14 in self-help. The top 30 books show 12,610 units bought in 90 days.[^c-books][^c-selfhelp]
- **Seasonality:** "książki" peaks in November (1.21), December (1.18) and October (1.13) and bottoms out in June and July (0.83), ratio 1.46. It is down to 0.83 over 5 years.[^t-books]
- **Niche: planners ("planer").** Searches peak in January (1.34), December (1.33) and September (1.16, back to school). They bottom out from April to June (0.74) and are up 1.13x over 5 years.[^t-niche] On Ceneo, the top 30 cost PLN 19 to 42 (median 30), and 12 of the 30 have no brand.[^c-planner] The rate is 8.5%.[^fee-list]
- **Judgement:** Very crowded (very high) for new books, which are identical items where the lowest price wins. Planners and notebooks let you sell your own design at a similar rate.

## 12. DIY and tools

- **Commission:** "Narzędzia" power tools (for example Szlifierki) are 5.5%, capped at PLN 120. Hand tools, measuring tools and tool storage (Organizacja i przechowywanie narzędzi) are 9%, capped at PLN 140. Plumbing tools and some building items are 8%, capped at PLN 250.[^fee-annex][^fee-list]
- **Typical bestseller price:** Ceneo workshop tools: PLN 51 to 285, median 124.[^c-tools] Ceneo grinders: PLN 281 to 579, median 452.[^c-grinders] Allegro: not verified.
- **Big brands?** Power tools, yes: DeWalt 9, Bosch 6 and Makita 3 of the top 30 grinders, with a median of 16 shops per product.[^c-grinders] Hand tools are more mixed: 20 brands, with Yato 7.[^c-tools]
- **Seasonality:** "narzędzia" peaks in November (1.10), March (1.08) and January (1.07) and bottoms out in July (0.84), ratio 1.30. It is flat over 5 years (0.98).[^t-diy]
- **Niche: tool organizers and storage ("organizer na narzędzia").** On Ceneo, the top 30 cost PLN 22 to 167 (median 60). They are spread over 18 brands (Qbrick System 10), with a median of 1 shop per product.[^c-toolorg] Trends: I did not pull this exact phrase. "stół warsztatowy" (workbench) is flat, at 1.04 over 5 years.[^t-niche]
- **Judgement:** Crowded in power tools, which are big-brand and price-compared, although the low capped rate helps whoever wins. Medium in storage and organizers. The organizer niche has weaker evidence than the others.

## 13. Household chemicals

- **Commission:** Not verified. The Allegro help page lists Supermarket at 5% to 10.5%.[^fee-help] Supermarket items not listed as exceptions in the annex pay 10.5%.[^fee-annex] I could not confirm from Allegro's own pages that cleaning products sit under Supermarket. The annex does say that "Chemia gospodarcza" listed under AGD do zabudowy (built-in appliances) pays 15% up to PLN 60, then 8% above.[^fee-annex]
- **Typical bestseller price:** Ceneo household chemicals: PLN 17 to 41, median 28.[^c-chem] Laundry capsules: PLN 38 to 70, median 60.[^c-caps] Dishwasher tablets: PLN 51 to 80, median 67.[^c-tabs] Allegro: not verified.
- **Big brands?** Yes for laundry and dishwashing: Ariel 9, Miele 4, Vizir 4 and Persil 3 of the top 30 capsules. Finish 9 and Fairy 9 of the top 30 tablets.[^c-caps][^c-tabs] General cleaners are more mixed (22 brands, led by Karcher machine fluids), with a median of 14 shops per product.[^c-chem]
- **Seasonality:** "środki czystości" peaks in March (1.14, spring cleaning), October and November (1.11). It bottoms out in June (0.84), ratio 1.36. It is down to 0.88 over 5 years.[^t-chem]
- **Niche: laundry sheets ("listki do prania").** This is the fastest-rising term I checked: up 22.85x over 5 years, starting from near zero. It peaks from August to October and bottoms out in February (0.22).[^t-niche] On Ceneo, only 27 products turn up, at a median of PLN 16. Dr. Beckmann has 7 of them, and 9 have no brand.[^c-sheets]
- **Judgement:** Crowded (high) and brand-led in the main products. Laundry sheets are early and scattered. Watch margins: at PLN 16, shipping and the commission take a large share, so sell multipacks.

## 14. Jewelry and watches

- **Commission:** Jewelry and watches follow the Moda rule: 11.5% up to PLN 110, then PLN 12.65 plus 7.5% above that. Jewelry and watch accessories pay 13% up to PLN 90, then PLN 11.70 plus 8% above that. Biżuteria i Zegarki / Pozostałe (other) pays 17%.[^fee-annex][^fee-list]
- **Typical bestseller price:** Ceneo women's jewelry (single-shop offers): PLN 81 to 407, median 231.[^c-jewelry] Allegro: not verified.
- **Big brands?** On Ceneo, yes: Swarovski 34 and Pandora 31 of 126 offers.[^c-jewelry]
- **Seasonality:** "biżuteria" peaks in December (1.43) and November (1.23) and bottoms out in March and September (0.85), ratio 1.69. It is down to 0.81 over 5 years. "zegarek" peaks in December (1.48), ratio 1.68, and is up 1.15x over 5 years.[^t-jewel]
- **Niche: hypoallergenic surgical steel earrings ("kolczyki stal chirurgiczna").** On Ceneo, the top 126 offers cost PLN 40 to 90 (median 60). 45 of them have no brand, and OTIEN has 39.[^c-steel] The downside: "stal chirurgiczna" searches are down to 0.75 over 5 years, with a December peak (1.24).[^t-niche]
- **Judgement:** Medium to high. Branded jewelry is out of reach, but unbranded steel and silver pieces are scattered. The sliding rate helps above PLN 110. Photos and packaging matter more than price here. This niche has mixed evidence because search interest is falling.

## 15. Hobby and craft supplies

- **Commission:** Kolekcje i sztuka / Rękodzieło is 14%, including Włóczki (yarn). Items in the "Akcesoria" rows (for example Haft diamentowy, Akcesoria plastyczne, Akcesoria krawieckie) pay 13% up to PLN 90, then PLN 11.70 plus 8% above that.[^fee-annex][^fee-list]
- **Typical bestseller price:** Ceneo diamond painting: PLN 14 to 44, median 21.[^c-diamond] Paint by numbers: PLN 30 to 45, median 36.[^c-paint] Yarn: PLN 16 to 45, median 26.[^c-yarn] Allegro: not verified.
- **Big brands?** No, apart from yarn, where Yarn Art holds 18 of the top 30. Almost every product in these lists is sold by one shop.[^c-yarn][^c-diamond][^c-paint]
- **Seasonality:** "włóczka" peaks in November (1.58), January (1.43) and October (1.29) and bottoms out in June (0.60), ratio 2.66. It is up 1.12x over 5 years. "rękodzieło" peaks in November (1.33), ratio 1.66, and is 0.91 over 5 years. "haft diamentowy" (diamond painting) has fallen to 0.40, and "szydełko" (crochet hook) to 0.77.[^t-craft]
- **Niche: yarn and crochet kits.** Yarn is the one craft term that is still growing, and it has a strong October to January season.[^t-craft] Ceneo listings are scattered across single shops.[^c-yarn]
- **Judgement:** Low to medium competition, but a high 14% rate and low prices (median PLN 21 to 36). Skip diamond painting, where interest has fallen 60%. A yarn kit (yarn, pattern, hook) at PLN 60 to 120 raises the order value above the prices of single skeins.

## Summary table

Commission is the net Allegro rate for the main subcategory. Typical price is the 25th to 75th percentile of the popular listings I checked, from Ceneo unless marked Allegro. Seasonality shows the peak month and the peak-to-trough ratio from Google Trends PL. Competition levels and niches are judgement.

| Category | Commission | Typical price (PLN) | Competition (judgement) | Seasonality | Niche (judgement) |
| --- | --- | --- | --- | --- | --- |
| Clothing and footwear | 11.5% to 110, then 7.5% | 101-140 dresses (Allegro); 159-456 shoes | High | Nov and Mar, 1.4x | Linen dresses |
| Home and garden | 10% (cap 250); 11% default | 38-100 pots; 74-1,024 garden | Medium | Apr, 1.9x | Raised garden beds |
| Furniture and decor | 9% (cap 250); 11% textiles | 132-520 tables; 42-97 throws | Medium | Nov, 1.4x | Plant stands (falling interest) |
| Electronics accessories | 15% to 60, then 8% | 15-29 cases (Allegro); 59-145 chargers | Very high | Dec, 1.2-1.4x | MagSafe add-ons above PLN 60 |
| Beauty and cosmetics | 8% skin care; 10% default | 37-125 | High | Dec, 1.5x | Less common Korean brands, sets |
| Supplements | 10.5% Zdrowie; 8.5% sport (cap 140) | 34-119 | Very high | Jan, 1.3x | Own-label creatine |
| Sports and outdoor | 11.5%; 10.5% fitness (cap 120) | 102-434 dumbbells; 304-1,750 tents | Medium | May, 4.2x (bikes) | Padel accessories |
| Toys and baby | 11.5%; 8% blocks; 9% dolls | 69-196 | High (dolls), medium (blocks) | Nov, 2.2-3.0x | Magnetic blocks |
| Pet supplies | 6% food; 10.5% or 13% accessories (unverified) | 105-170 food; 59-201 beds | Very high (food), medium (accessories) | Flat, 1.2x | Dog beds |
| Car parts and accessories | 9% new (cap 140); 16% used | 124-414 | Medium | Feb, 1.4x | Trunk organizers |
| Books and media | 8.5%; 5% textbooks | 45-57 | Very high | Nov, 1.5x | Own-design planners |
| DIY and tools | 5.5% power (cap 120); 9% hand (cap 140) | 51-285 hand; 281-579 power | High (power), medium (storage) | Nov and Mar, 1.3x | Tool organizers (weak evidence) |
| Household chemicals | Unverified (likely 10.5%) | 17-70 | High | Mar, 1.4x | Laundry sheets |
| Jewelry and watches | 11.5% to 110, then 7.5% | 81-407 | Medium to high | Dec, 1.7x | Surgical steel earrings (falling interest) |
| Hobby and craft | 14% craft; 13% to 90 accessories | 14-45 | Low to medium | Nov, 2.7x (yarn) | Yarn and crochet kits |

## Sources

All accessed 2026-09-28.

[^fee-annex]: Allegro, Załącznik nr 4 do Regulaminu Allegro, "Opłaty i prowizje", art. 8 (Prowizje od sprzedaży). https://policies.allegro.com/doc/8c51411ca0a0ac37947e9c866ce38ba739d9163d8d001d75e9705be7ee4b258c
[^fee-annex2]: Allegro, Załącznik nr 4 (second copy on the same site; the commission rows match the first). https://policies.allegro.com/doc/dfb255672d81e58a7b16854ebf2299b193b4379852036b8449fa884689038345
[^fee-list]: Allegro, per-category commission list, "Stawki prowizji obowiązują od 2.03.2026 roku" (ID kategorii, ścieżka kategorii, stawka prowizji netto). https://policies.allegro.com/doc/b9b01adcea5ce4104796e801719b63720dfcf1af4e6686696cf5d6b803465902
[^fee-help]: Allegro Pomoc, "Opłaty dla sprzedających, cennik". https://help.allegro.com/pl/fees/pl
[^al-dress]: Allegro, category Sukienki (124264), sorted "popularność: największa". https://allegro.pl/kategoria/odziez-damska-sukienki-124264?order=qd
[^al-etui]: Allegro, category Etui i pokrowce (353), sorted "popularność: największa". https://allegro.pl/kategoria/akcesoria-gsm-etui-i-pokrowce-353?order=qd
[^al-padel]: Allegro, search "padel", sorted "popularność: największa". https://allegro.pl/listing?string=padel&order=qd
[^c-dress]: Ceneo, Sukienki, most popular. https://www.ceneo.pl/Sukienki;0115-1.htm
[^c-shoes]: Ceneo, Obuwie damskie, most popular. https://www.ceneo.pl/Obuwie_damskie;0115-1.htm
[^c-linen]: Ceneo, search "sukienka lniana", most popular. https://www.ceneo.pl/;szukaj-sukienka+lniana;0115-1.htm
[^c-garden]: Ceneo, Ogród, most popular. https://www.ceneo.pl/Ogrod;0115-1.htm
[^c-pots]: Ceneo, Donice i pojemniki, most popular. https://www.ceneo.pl/Donice_i_pojemniki;0115-1.htm
[^c-beds]: Ceneo, search "grządka podwyższona" (within Ogród), most popular. https://www.ceneo.pl/Ogrod;szukaj-grzadka+podwyzszona;0115-1.htm
[^c-tables]: Ceneo, Ławy i stoliki, most popular. https://www.ceneo.pl/Lawy_i_stoliki;0115-1.htm
[^c-blankets]: Ceneo, Koce i pledy, most popular. https://www.ceneo.pl/Koce_i_pledy;0115-1.htm
[^c-stands]: Ceneo, Kwietniki, search "stojak na kwiaty", most popular. https://www.ceneo.pl/Kwietniki;szukaj-stojak+na+kwiaty;0115-1.htm
[^c-chargers]: Ceneo, Ładowarki do telefonów, most popular. https://www.ceneo.pl/Ladowarki_do_telefonow;0115-1.htm
[^c-powerbanks]: Ceneo, Powerbanki, most popular. https://www.ceneo.pl/Powerbanki;0115-1.htm
[^c-cases]: Ceneo, Pokrowce i etui do telefonów, most popular. https://www.ceneo.pl/Pokrowce_i_etui_do_telefonow;0115-1.htm
[^c-magsafe]: Ceneo, search "etui magsafe", most popular. https://www.ceneo.pl/Pokrowce_i_etui_do_telefonow;szukaj-etui+magsafe;0115-1.htm
[^c-creams]: Ceneo, Kremy do twarzy, most popular. https://www.ceneo.pl/Kremy_do_twarzy;0115-1.htm
[^c-serums]: Ceneo, Serum do twarzy, most popular. https://www.ceneo.pl/Serum_do_twarzy;0115-1.htm
[^c-supps]: Ceneo, Odżywki i suplementy, most popular. https://www.ceneo.pl/Odzywki_i_suplementy;0115-1.htm
[^c-vits]: Ceneo, Witaminy i minerały, most popular. https://www.ceneo.pl/Mineraly_i_witaminy;0115-1.htm
[^c-creatine]: Ceneo, Kreatyny, most popular. https://www.ceneo.pl/Kreatyny;0115-1.htm
[^c-tents]: Ceneo, Namioty, most popular. https://www.ceneo.pl/Namioty;0115-1.htm
[^c-dumbbells]: Ceneo, Hantle, most popular. https://www.ceneo.pl/Hantle;0115-1.htm
[^c-bikes]: Ceneo, Rowery, most popular. https://www.ceneo.pl/Rowery;0115-1.htm
[^c-padel]: Ceneo, search "rakieta do padla", most popular. https://www.ceneo.pl/Tenis_i_pokrewne;szukaj-rakieta+do+padla;0115-1.htm
[^c-blocks]: Ceneo, Klocki, most popular. https://www.ceneo.pl/Klocki;0115-1.htm
[^c-dolls]: Ceneo, Lalki, most popular. https://www.ceneo.pl/Lalki;0115-1.htm
[^c-magblocks]: Ceneo, search "klocki magnetyczne" (within Klocki), most popular. https://www.ceneo.pl/Klocki;szukaj-klocki+magnetyczne;0115-1.htm
[^c-dogfood]: Ceneo, Karmy dla psów, most popular. https://www.ceneo.pl/Karmy_dla_psow;0115-1.htm
[^c-leash]: Ceneo, Smycze dla psów, most popular. https://www.ceneo.pl/Smycze_dla_psow;0115-1.htm
[^c-scratch]: Ceneo, Drapaki dla kotów, most popular. https://www.ceneo.pl/Drapaki_dla_kotow;0115-1.htm
[^c-dogbeds]: Ceneo, Legowiska dla psów, search "legowisko dla psa", most popular. https://www.ceneo.pl/Legowiska_dla_psow;szukaj-legowisko+dla+psa;0115-1.htm
[^c-moto]: Ceneo, Motoryzacja, most popular. https://www.ceneo.pl/Motoryzacja;0115-1.htm
[^c-oil]: Ceneo, Oleje silnikowe, most popular. https://www.ceneo.pl/Oleje_silnikowe;0115-1.htm
[^c-dashcam]: Ceneo, Kamery samochodowe, most popular. https://www.ceneo.pl/Kamery_samochodowe;0115-1.htm
[^c-organizer]: Ceneo, Akcesoria do samochodu, search "organizer do bagażnika", most popular. https://www.ceneo.pl/Akcesoria_do_samochodu;szukaj-organizer+do+bagaznika;0115-1.htm
[^c-books]: Ceneo, Księgarnia, most popular. https://www.ceneo.pl/Ksiegarnia;0115-1.htm
[^c-selfhelp]: Ceneo, Poradniki psychologiczne, most popular. https://www.ceneo.pl/Poradniki_psychologiczne;0115-1.htm
[^c-planner]: Ceneo, search "planer", most popular. https://www.ceneo.pl/;szukaj-planer;0115-1.htm
[^c-tools]: Ceneo, Narzędzia warsztatowe, most popular. https://www.ceneo.pl/Narzedzia_warsztatowe;0115-1.htm
[^c-grinders]: Ceneo, Szlifierki i polerki, most popular. https://www.ceneo.pl/Szlifierki_i_polerki;0115-1.htm
[^c-toolorg]: Ceneo, search "organizer na narzędzia", most popular. https://www.ceneo.pl/;szukaj-organizer+na+narzedzia;0115-1.htm
[^c-chem]: Ceneo, Chemia gospodarcza, most popular. https://www.ceneo.pl/Chemia_gospodarcza;0115-1.htm
[^c-caps]: Ceneo, Kapsułki do prania, most popular. https://www.ceneo.pl/Kapsulki_do_prania;0115-1.htm
[^c-tabs]: Ceneo, Tabletki do zmywarki, most popular. https://www.ceneo.pl/Tabletki_do_zmywarki;0115-1.htm
[^c-sheets]: Ceneo, Pranie, search "listki do prania", most popular. https://www.ceneo.pl/Pranie;szukaj-listki+do+prania;0115-1.htm
[^c-jewelry]: Ceneo, Biżuteria dla kobiet, most popular. https://www.ceneo.pl/Bizuteria_dla_kobiet;0115-1.htm
[^c-steel]: Ceneo, Biżuteria dla kobiet, search "kolczyki stal chirurgiczna", most popular. https://www.ceneo.pl/Bizuteria_dla_kobiet;szukaj-kolczyki+stal+chirurgiczna;0115-1.htm
[^c-diamond]: Ceneo, Haft diamentowy, most popular. https://www.ceneo.pl/Haft_diamentowy;0115-1.htm
[^c-paint]: Ceneo, Malowanie po numerach, most popular. https://www.ceneo.pl/Malowanie_po_numerach;0115-1.htm
[^c-yarn]: Ceneo, Włóczki, most popular. https://www.ceneo.pl/Wloczki;0115-1.htm
[^t-cloth]: Google Trends, PL, today 5-y, "odzież" and "buty". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=odzież and https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=buty (data via trends.google.com/trends/api/widgetdata/multiline)
[^t-home]: Google Trends, PL, today 5-y, "ogród" and "meble". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=ogród and https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=meble
[^t-elec]: Google Trends, PL, today 5-y, "ładowarka" and "etui na telefon". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=ładowarka and https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=etui%20na%20telefon
[^t-beauty]: Google Trends, PL, today 5-y, "kosmetyki". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=kosmetyki
[^t-health]: Google Trends, PL, today 5-y, "suplementy". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=suplementy
[^t-sport]: Google Trends, PL, today 5-y, "rower". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=rower
[^t-toys]: Google Trends, PL, today 5-y, "zabawki" and "klocki". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=zabawki and https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=klocki
[^t-pet]: Google Trends, PL, today 5-y, "karma dla psa". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=karma%20dla%20psa
[^t-car]: Google Trends, PL, today 5-y, "części samochodowe". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=części%20samochodowe
[^t-books]: Google Trends, PL, today 5-y, "książki". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=książki
[^t-diy]: Google Trends, PL, today 5-y, "narzędzia". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=narzędzia
[^t-chem]: Google Trends, PL, today 5-y, "środki czystości". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=środki%20czystości
[^t-jewel]: Google Trends, PL, today 5-y, "biżuteria" and "zegarek". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=biżuteria and https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=zegarek
[^t-craft]: Google Trends, PL, today 5-y, "włóczka", "rękodzieło", "haft diamentowy", "szydełko". https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=włóczka (same URL pattern for the other terms)
[^t-niche]: Google Trends, PL, today 5-y, one query per niche term: "sukienka lniana", "grządka podwyższona", "kwietnik", "magsafe", "kosmetyki koreańskie", "kreatyna", "padel", "klocki magnetyczne", "legowisko dla psa", "organizer do bagażnika", "planer", "stół warsztatowy", "listki do prania", "stal chirurgiczna". URL pattern: https://trends.google.com/trends/explore?geo=PL&date=today%205-y&q=padel
