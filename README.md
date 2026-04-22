# MontBlanc Dialer

Uygulama sürümü `version.json` içindedir. `index.html` kökü `html/fragments/` parçalarından `npm run build` ile üretilir; `index.html`’i elle düzenlediyseniz tekrar `build` çalıştırın.

## Smoke Test

Kritik akışları deploy öncesi hızlı doğrulamak için:

```bash
npm run smoke
```

Bu test paketi aşağıdaki çekirdek modüllerde beklenen fonksiyonların varlığını doğrular:
- login/boot (`js/auth.js`)
- kullanıcı oluşturma / şifre reset (`js/agents.js`)
- dialer güvenilirlik paneli (`js/dialer.js`)
- saha modülü + KPI (`js/field.js`)
- bildirim merkezi (`js/notification-center.js`)
- feature flags (`js/feature-flags.js`)
- iş platformu (`js/job-market.js`)
- iş platformu QC kuyruğu (`js/qc-job-market.js`)
- firma cüzdan/bakiye yardımcıları (`js/wallet.js`)

## Is Platformu MVP

- Firma admin/super admin yeni iş ilanı açabilir.
- İlan butcesi, firmanin kullanilabilir bakiyesini asamaz.
- Diger firmalar `Buna calisacagim` ile ilani sahiplenmeden calismaya baslar.
- Ilk teslim girisleri QC moduna gore ya direkt kapanir ya da QC kuyruuna duser.
- QC onayinda transfer hareketleri `wallet_ledger` tablosuna yazilir.
