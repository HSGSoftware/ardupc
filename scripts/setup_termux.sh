#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

PROJECT_DIR="${1:-$HOME/ardupc}"
VENV_DIR="${PROJECT_DIR}/.venv"
ARUPILOT_DIR="${ARDUPILOT_DIR:-$HOME/ardupilot}"
SIM_VEHICLE_DEFAULT="${ARUPILOT_DIR}/Tools/autotest/sim_vehicle.py"

echo "==> [1/8] Termux paket listesi güncelleniyor..."
pkg update -y
pkg upgrade -y

echo "==> [2/8] Gerekli sistem paketleri kuruluyor..."
pkg install -y \
  python \
  python-pip \
  git \
  clang \
  make \
  cmake \
  libffi \
  openssl \
  rust \
  libjpeg-turbo \
  libpng \
  freetype

if [[ ! -d "${PROJECT_DIR}" ]]; then
  echo "HATA: Proje dizini bulunamadı: ${PROJECT_DIR}"
  echo "Kullanım: bash scripts/setup_termux.sh /tam/proje/yolu"
  exit 1
fi

echo "==> [3/8] Python sanal ortamı oluşturuluyor..."
python -m venv "${VENV_DIR}"
# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"
python -m pip install --upgrade pip wheel setuptools

echo "==> [4/8] Proje Python bağımlılıkları kuruluyor..."
pip install -r "${PROJECT_DIR}/requirements.txt"

echo "==> [5/8] ArduPilot kontrolü..."
if [[ ! -d "${ARUPILOT_DIR}" ]]; then
  echo "ArduPilot dizini bulunamadı, klonlanıyor: ${ARUPILOT_DIR}"
  git clone --depth 1 https://github.com/ArduPilot/ardupilot.git "${ARUPILOT_DIR}"
fi

if [[ -f "${ARUPILOT_DIR}/Tools/environment_install/install-prereqs-ubuntu.sh" ]]; then
  echo "==> [6/8] ArduPilot Python bağımlılıkları kuruluyor..."
  pip install future pymavlink MAVProxy
fi

echo "==> [7/8] Çalışma ortamı ayar dosyası yazılıyor..."
cat > "${PROJECT_DIR}/.env.termux" <<EOF
export SITL_RUNTIME_MODE=host
export SIM_VEHICLE_CMD="python3 ${SIM_VEHICLE_DEFAULT}"
export FLASK_ENV=development
EOF

echo "==> [8/8] Başlatma yardımcı scripti oluşturuluyor..."
cat > "${PROJECT_DIR}/run_termux.sh" <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${PROJECT_DIR}/.venv/bin/activate"
if [[ -f "${PROJECT_DIR}/.env.termux" ]]; then
  # shellcheck disable=SC1091
  source "${PROJECT_DIR}/.env.termux"
fi
cd "${PROJECT_DIR}"
python manage.py runserver 0.0.0.0:8181
EOF
chmod +x "${PROJECT_DIR}/run_termux.sh"

if [[ ! -f "${SIM_VEHICLE_DEFAULT}" ]]; then
  echo "UYARI: sim_vehicle.py bulunamadı: ${SIM_VEHICLE_DEFAULT}"
  echo "ArduPilot dizinini doğrulayın veya .env.termux içinde SIM_VEHICLE_CMD değerini güncelleyin."
fi

cat <<EOM

✅ Kurulum tamamlandı.

Sonraki adımlar:
1) cd "${PROJECT_DIR}"
2) source .venv/bin/activate
3) source .env.termux
4) ./run_termux.sh

Not:
- SIM_VEHICLE_CMD varsayılanı: ${SIM_VEHICLE_DEFAULT}
- Eğer sim_vehicle.py farklı yerdeyse .env.termux dosyasını düzenleyin.
EOM
