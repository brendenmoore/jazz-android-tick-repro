#!/usr/bin/env python3
"""Assert the exact Jazz tick symptom; restore the device's radio settings afterward."""
import argparse, re, subprocess, time, xml.etree.ElementTree as ET
p = argparse.ArgumentParser()
p.add_argument('--serial', default='emulator-5554')
p.add_argument('--idle-seconds', type=int, default=0)
args = p.parse_args()

def adb(*parts):
    return subprocess.check_output(['adb', '-s', args.serial, *parts], text=True)

def nodes():
    adb('shell', 'uiautomator', 'dump', '/sdcard/jazz-repro.xml')
    return list(ET.fromstring(adb('shell', 'cat', '/sdcard/jazz-repro.xml')).iter('node'))

def tap(label):
    for n in nodes():
        if label.lower() in n.get('text', '').lower() or label == n.get('resource-id'):
            (x1, y1, x2, y2) = map(int, re.findall('\\d+', n.get('bounds')))
            adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
            return
    raise RuntimeError('Control not found: ' + label)
package = 'dev.bmoore.jazztickrepro'
if package not in adb('shell', 'dumpsys', 'activity', 'activities').split('topResumedActivity=')[-1].split('\n')[0]:
    raise SystemExit('Open Jazz Tick Repro first.')
started = adb('shell', "date '+%m-%d %H:%M:%S.000'").strip()
pid = adb('shell', 'pidof', package).strip()
if not pid:
    raise SystemExit('Reproduction app is not running.')
airplane = adb('shell', 'settings', 'get', 'global', 'airplane_mode_on').strip()
wifi = adb('shell', 'settings', 'get', 'global', 'wifi_on').strip()
symptom = 'Jazz native foreground runtime failed during tick'

def logs():
    return adb('logcat', '-d', '-v', 'time', '--pid=' + pid, '-T', started, 'JazzTickProbe:*', 'ReactNativeJS:*', '*:S')
try:
    if any(('CREATE LOCAL-FIRST' in n.get('text', '') for n in nodes())):
        tap('Create local-first')
        time.sleep(4)
    tap('Add todo')
    time.sleep(1)
    tap('Add subtask')
    time.sleep(1)
    if args.idle_seconds:
        print('Waiting for idle failure with no radio changes...', flush=True)
        deadline = time.monotonic() + args.idle_seconds
    else:
        adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
        adb('shell', 'svc', 'wifi', 'disable')
        time.sleep(4)
        try:
            tap('todo-title')
            adb('shell', 'input', 'text', 'x')
            adb('shell', 'input', 'keyevent', '4')
        except RuntimeError:
            if symptom not in logs():
                raise
        deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        captured = logs()
        if symptom in captured:
            print('\n'.join((l for l in captured.splitlines() if 'JazzTickProbe' in l or symptom in l)))
            print('RED: exact tick failure reproduced.', flush=True)
            raise SystemExit(1)
        time.sleep(1)
    print('GREEN: no tick failure during the bounded observation.', flush=True)
finally:
    if not args.idle_seconds:
        adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable' if airplane == '1' else 'disable')
        adb('shell', 'svc', 'wifi', 'enable' if wifi in ('1', '2') else 'disable')
