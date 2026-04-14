# MontBlanc Dialer

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
