## SignalServer Release update

## Release Note

#### v1.1.2 (20/09/07)
 => 연동규격서 v1.0 반영
 - 개발 서버 dev.knowledgetalk.co.kr 도메인 반영 (9/8 적용 예정)
 - KeepAlive, ExitRoom Op 추가
 - Media Server 연동 실패 시 CPU 수치 기반으로 다음 서버로 연동되도록 수정  
 - 기타 버그 및 안정성 개선

#### v1.1.0 (20/08/28)
 - 서버 구조 Interface / Core 로 변경
 - Media Server loadbalancing 추가
 - Media Server 접속 오류 시, Client 에게 Message 전송
 - Error Code 정리
 - 연동규격서 Update(v0.8)