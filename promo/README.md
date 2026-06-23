# Montblanc Dialer — Tanıtım videoları

54 saniyelik animasyonlu tanıtım (6 slayt × 9 sn). Montblanc altın/dark tema, mock UI.

## Çıktılar

| Dosya | Dil | Format | Boyut |
|-------|-----|--------|-------|
| `montblanc-dialer-tr-dikey.mp4` | Türkçe | 1080×1920 (9:16) | Reels / Story |
| `montblanc-dialer-tr-yatay.mp4` | Türkçe | 1920×1080 (16:9) | YouTube / web |
| `montblanc-dialer-de-dikey.mp4` | Almanca | 1080×1920 | Reels / Story |
| `montblanc-dialer-de-yatay.mp4` | Almanca | 1920×1080 | YouTube / web |

## Yeniden üretmek

```bash
npm install
npx playwright install chromium
node promo/render-promo.mjs
```

Önizleme (tarayıcı): `promo/promo.html?lang=tr&orient=vertical`

## Not

Videolarda **ses / seslendirme yok** — sadece animasyonlu metin ve mock arayüz. İsterseniz bu MP4’lere CapCut / DaVinci ile müzik ve voice-over ekleyebilirsiniz.

Slayt metinlerini düzenlemek için `promo/promo.html` içindeki `COPY.tr` ve `COPY.de` objelerini güncelleyin.
