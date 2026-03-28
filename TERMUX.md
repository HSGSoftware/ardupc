# Termux / Docker'sız Kullanım

Bu proje Android + Termux ortamında Docker olmadan da çalışabilir.

## Başlatma

### Tek komutla kurulum (önerilen)

```bash
bash scripts/setup_termux.sh
```

Kurulum sonrası:

```bash
./run_termux.sh
```

### Manuel başlatma

```bash
export SITL_RUNTIME_MODE=host
export SIM_VEHICLE_CMD=sim_vehicle.py
python app.py
```

Alternatif (Django tarzı başlatıcı bekleyen araçlar için):

```bash
python manage.py runserver 0.0.0.0:8181
```

- `SITL_RUNTIME_MODE=host`: Docker yerine doğrudan host süreç çalıştırır.
- `SIM_VEHICLE_CMD`: `sim_vehicle.py` komutu (gerekirse tam path verin).

Örnek:

```bash
export SIM_VEHICLE_CMD="$HOME/ardupilot/Tools/autotest/sim_vehicle.py"
```
