# 의존성 없이 아이콘 PNG 생성: 어두운 배경 + 코드 다이어그램
import zlib, struct, sys, os
def png(path, n):
    bg=(22,23,27); line=(200,186,160); acc=(240,160,75); bass=(106,162,255)
    px=[[bg]*n for _ in range(n)]
    s=n/180.0
    def rect(x0,y0,x1,y1,c):
        for y in range(max(0,int(y0)),min(n,int(y1))):
            for x in range(max(0,int(x0)),min(n,int(x1))): px[y][x]=c
    def disc(cx,cy,r,c):
        for y in range(int(cy-r),int(cy+r)+1):
            for x in range(int(cx-r),int(cx+r)+1):
                if (x-cx)**2+(y-cy)**2<=r*r and 0<=x<n and 0<=y<n: px[y][x]=c
    L,R,T,B=40*s,140*s,38*s,148*s
    for i in range(6): x=L+i*(R-L)/5; rect(x-1.5*s,T,x+1.5*s,B,line)
    rect(L-1.5*s,T-7*s,R+1.5*s,T,line)
    for j in range(1,5): y=T+j*(B-T)/4; rect(L,y-1.2*s,R,y+1.2*s,line)
    fy=lambda f:T+(f-0.5)*(B-T)/4; sx=lambda i:L+i*(R-L)/5
    disc(sx(1),fy(3),10*s,bass); disc(sx(2),fy(2),10*s,acc)
    raw=b''.join(b'\x00'+bytes(sum(row,())) for row in px)
    def chunk(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    open(path,'wb').write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',n,n,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b''))
d=sys.argv[1]
png(os.path.join(d,'apple-touch-icon.png'),180); png(os.path.join(d,'icon-192.png'),192); png(os.path.join(d,'icon-512.png'),512)
