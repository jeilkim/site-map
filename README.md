# site-map

여러 현장명·주소를 입력하면 **네이버 지도**에 좌표 마커와 현장명을 표시하는 웹 앱입니다.

## 기능

- 현장명 + 주소 직접 입력
- CSV 업로드로 여러 현장 일괄 등록 (`현장명,주소`)
- 네이버 지도 마커 + 현장명 라벨
- 목록에서 해당 위치로 이동 / 삭제
- Client ID·현장 목록 브라우저 로컬 저장

## 사전 준비 (네이버 지도 API)

1. [네이버 클라우드 플랫폼](https://www.ncloud.com/) 가입
2. **AI·NAVER API > Maps** 에서 Application 생성
3. 아래 API를 사용 설정
   - **Maps** (Dynamic Map)
   - **Geocoding** (주소 → 좌표)
4. **Client ID** 발급
5. **Web 서비스 URL**에 사용할 도메인 등록  
   - 로컬 테스트: `http://localhost`, `http://127.0.0.1`  
   - 파일로 직접 열면(`file://`) 도메인 제한으로 막힐 수 있으니 로컬 서버 사용을 권장합니다.

> 참고: 최근 Maps JS SDK는 `ncpKeyId` 파라미터를 사용합니다. 구버전 `ncpClientId` 문서도 있을 수 있으니 콘솔의 최신 가이드를 확인하세요.

## 실행 방법

로컬 서버로 열기 (권장):

```bash
# Python이 있는 경우
python -m http.server 5500
```

브라우저에서 `http://localhost:5500` 접속 → 왼쪽 **API 설정**에 Client ID 입력 → **저장 후 지도 불러오기**

## CSV 형식

```csv
현장명,주소
강남 현장,서울특별시 강남구 테헤란로 152
판교 현장,경기도 성남시 분당구 판교역로 166
```

`sample.csv` 파일을 참고하세요.

## 폴더 구조

```
site-map/
├── index.html
├── styles.css
├── app.js
├── sample.csv
└── README.md
```

## 주의사항

- Client ID는 브라우저에 노출됩니다. 반드시 NCP 콘솔에서 **허용 도메인**을 제한하세요.
- Geocoding 할당량/과금 정책은 NCP 요금 안내를 확인하세요.
- 주소가 애매하면 변환에 실패할 수 있습니다. 도로명·지번을 정확히 입력하세요.
