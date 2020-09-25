## SignalServer Release update

## Release Note

#### v1.1.4 (20/09/25)
 - VideoRoomJoin Op 추가 (Media Server 통해서만 통신할 수 있도록)

#### v1.1.3 (20/09/10)
 - KeepAlive 타임아웃 적용 (60초, disconnect 없이 로그만 찍음)
 - ExitRoom / Disconnect 구분 되도록 변경

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
