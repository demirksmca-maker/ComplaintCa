#!/usr/bin/env python3
# "ComplaintCA Theme" — the brand's signature score (31.5s, D minor).
# Fully synthesized from sine waves; no samples, no third-party audio,
# so the result is 100% original and royalty-free. Regenerate with:
#   pip install numpy && python3 generate_theme.py   -> score.wav
# The arrangement timing matches the promo-reel scene changes at
# 0 / 5.3 / 10.1 / 13.9 / 21.1 / 25.4 seconds.
import numpy as np, wave

SR = 44100
DUR = 31.5
N = int(SR*DUR)
t = np.arange(N)/SR
L = np.zeros(N); R = np.zeros(N)

def n2f(name):
    names={'C':0,'C#':1,'Db':1,'D':2,'D#':3,'Eb':3,'E':4,'F':5,'F#':6,'Gb':6,'G':7,'G#':8,'Ab':8,'A':9,'A#':10,'Bb':10,'B':11}
    pitch=names[name[:-1]]; octv=int(name[-1])
    midi=12*(octv+1)+pitch
    return 440.0*2**((midi-69)/12)

def env(t0,t1,att,rel):
    e=np.zeros(N)
    i0,i1=int(t0*SR),min(int(t1*SR),N)
    seg=i1-i0
    if seg<=0: return e
    a=min(int(att*SR),seg); r=min(int(rel*SR),seg)
    core=np.ones(seg)
    core[:a]=np.linspace(0,1,a)
    core[seg-r:]=np.linspace(1,0,r)
    e[i0:i1]=core
    return e

def pad(notes,t0,t1,amp=0.11):
    global L,R
    e=env(t0,t1,1.8,2.2)
    for i,nm in enumerate(notes):
        f=n2f(nm)
        det=1.0+0.0016*(i%2*2-1)
        w=np.sin(2*np.pi*f*t)+0.6*np.sin(2*np.pi*f*det*t)+0.25*np.sin(2*np.pi*2*f*t)
        w*= amp*e/len(notes)
        panL=0.5+0.3*np.sin(2*np.pi*0.05*t+i)
        L+=w*panL; R+=w*(1-panL)

def sub(nm,t0,t1,amp=0.16):
    global L,R
    f=n2f(nm); e=env(t0,t1,1.2,2.0)
    w=np.sin(2*np.pi*f*t)*amp*e
    L+=w; R+=w

def pluck(nm,at,amp=0.14,decay=1.3):
    global L,R
    f=n2f(nm); i0=int(at*SR)
    dur=int(decay*SR); idx=np.arange(dur)
    seg=(np.sin(2*np.pi*f*idx/SR)+0.4*np.sin(2*np.pi*2*f*idx/SR)+0.15*np.sin(2*np.pi*3*f*idx/SR))
    seg*=np.exp(-idx/(decay*SR/5.5))*amp
    end=min(i0+dur,N)
    L[i0:end]+=seg[:end-i0]*0.9; R[i0:end]+=seg[:end-i0]*0.7

def swell(t0,t1,amp=0.10):
    global L,R
    i0,i1=int(t0*SR),int(t1*SR)
    seg=i1-i0
    rng=np.random.default_rng(7)
    noise=rng.standard_normal(seg)
    k=90
    noise=np.convolve(noise,np.ones(k)/k,mode='same')
    e=np.linspace(0,1,seg)**2.5
    w=noise*e*amp
    L[i0:i1]+=w; R[i0:i1]+=w*0.9

sub('D2',0,10.5); pad(['D3','A3'],0,5.6,0.07)
pad(['D3','F3','A3'],5.2,10.4,0.10)
swell(8.6,10.1,0.09)
sub('Bb1',10.1,14.2); pad(['Bb2','D3','F3','Bb3'],10.0,14.2,0.13)
pluck('D5',10.15,0.12); pluck('F5',10.55,0.10)
sub('F2',13.9,21.4); pad(['F3','A3','C4'],13.8,21.4,0.12)
pluck('A4',14.4,0.13); pluck('C5',15.8,0.13); pluck('F5',17.1,0.13)
pluck('A4',18.4,0.09); pluck('C5',19.4,0.09)
sub('C2',21.1,25.7); pad(['C3','E3','G3'],21.0,25.7,0.12)
for i,at in enumerate([21.3,22.25,23.2,24.15]):
    pluck(['E5','G5','C5','E5'][i],at,0.12,1.0)
swell(23.6,25.4,0.11)
sub('D2',25.4,31.5,0.18); pad(['D3','F3','A3','E4'],25.3,31.5,0.15)
pluck('D5',25.5,0.15,2.2); pluck('A5',26.2,0.10,2.0); pluck('E5',27.0,0.09,2.2)

d=int(0.32*SR)
for ch in (L,R):
    ch[d:]+=0.30*ch[:-d].copy()
    ch[2*d:]+=0.12*ch[:-2*d].copy()

mix=np.stack([L,R])
mix=np.tanh(mix*1.15)
fi=int(0.6*SR); fo=int(2.5*SR)
mix[:,:fi]*=np.linspace(0,1,fi)
mix[:,-fo:]*=np.linspace(1,0,fo)
mix/=np.abs(mix).max()*1.12

pcm=(mix.T*32767).astype(np.int16)
with wave.open('score.wav','wb') as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR)
    f.writeframes(pcm.tobytes())
print("score.wav written")
