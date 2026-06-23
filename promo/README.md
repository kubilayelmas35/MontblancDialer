# Montblanc Dialer — Tanıtım videoları

Gerçek uygulama arayüzünü gezen tanıtım videoları (~95 sn). Playwright ile kayıt; login, dashboard, kampanyalar, dialer, agentler, istatistikler, QC, takvim ve daha fazlası.

## Çıktılar

| Dosya | Dil | Format | Kullanım |
|-------|-----|--------|----------|
| `montblanc-dialer-tr-dikey.mp4` | Türkçe | 1080×1920 (9:16) | Reels / Story |
| `montblanc-dialer-tr-yatay.mp4` | Türkçe | 1920×1080 (16:9) | YouTube / web |
| `montblanc-dialer-de-dikey.mp4` | Almanca | 1080×1920 | Reels / Story |
| `montblanc-dialer-de-yatay.mp4` | Almanca | 1920×1080 | YouTube / web |

## Yeniden üretmek

```bash
npm install
npx playwright install chromium
npm run promo:walkthrough
```

Eski metin slayt videoları (54 sn animasyon):

```bash
npm run promo:slides
```

## Dosyalar

- `render-walkthrough.mjs` — gerçek uygulama turu kaydı
- `walkthrough-tour.mjs` — sayfa sırası ve TR/DE alt yazılar
- `promo.html` + `render-promo.mjs` — eski slayt tabanlı promo

Tur adımlarını değiştirmek için `walkthrough-tour.mjs` içindeki `buildTour()` fonksiyonunu düzenleyin.

## Not

Videolarda **ses / seslendirme yok**. Alt bantta özellik başlıkları görünür. CapCut veya DaVinci ile müzik ve voice-over eklenebilir.
