// SafeRoute – Voice SOS Service
import { events, showToast } from '../utils.js';

let _recognition = null;
let _mediaRecorder = null;
let _audioChunks = [];
let _restartCount = 0;
let _isRestarting = false;

export function startVoiceDetection() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn('[Voice] SpeechRecognition not supported in this browser.');
        return;
    }

    _recognition = new SpeechRecognition();
    _recognition.continuous = true;
    _recognition.lang = 'en-US';
    _recognition.interimResults = false;

    _recognition.onresult = (event) => {
        const last = event.results.length - 1;
        const text = event.results[last][0].transcript.toLowerCase();
        
        console.log('[Voice] Heard:', text);
        
        if (text.includes('help me')) {
            events.emit('sos-trigger', { reason: 'voice' });
            startRecording();
        }
    };

    _recognition.onerror = (event) => {
        // Suppress errors that are common or noise
        if (event.error === 'aborted') return;
        if (event.error === 'network') return; // Silence network spam
        
        console.error('[Voice] Recognition error:', event.error);
    };

    _recognition.onend = () => {
        if (!_recognition || _isRestarting) return;
        
        // Cooldown restart to avoid CPU/API spam
        _isRestarting = true;
        _restartCount++;

        const delay = _restartCount > 5 ? 10000 : 2000;
        
        setTimeout(() => {
            if (_recognition) {
                try {
                    _recognition.start();
                    _isRestarting = false;
                    _restartCount = 0; // Reset on success
                } catch (e) {
                    // Still active
                }
            }
        }, delay);
    };

    try {
        _recognition.start();
        console.log('[Voice] Trigger "Help me" active.');
    } catch (e) {
        console.warn('[Voice] Already started or blocked', e);
    }
}

export function stopVoiceDetection() {
    if (_recognition) {
        _recognition.stop();
        _recognition = null;
    }
}

export async function startRecording(durationMs = 30000, alertId = null) {
    if (_mediaRecorder && _mediaRecorder.state === 'recording') return;
    
    events.emit('recording-started');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        _mediaRecorder = new MediaRecorder(stream);
        _audioChunks = [];

        _mediaRecorder.ondataavailable = (event) => {
            _audioChunks.push(event.data);
        };

        _mediaRecorder.onstop = async () => {
            const blob = new Blob(_audioChunks, { type: 'audio/webm' });
            console.log('[Voice] Audio recording captured:', blob.size, 'bytes');
            showToast('Emergency audio recorded. Uploading...', 'info');
            
            // Always Attempt Upload to Supabase
            import('../supabase.js').then(async ({ getSupabase }) => {
                const sb = getSupabase();
                if(!sb) return;
                
                const prefix = alertId || 'anonymous_sos';
                const fileName = `${prefix}_${Date.now()}.webm`;
                const { data, error } = await sb.storage.from('sos_audio').upload(fileName, blob, {
                    contentType: 'audio/webm'
                });
                
                if (data && !error) {
                    const { data: publicData } = sb.storage.from('sos_audio').getPublicUrl(fileName);
                    console.log('[Voice] Audio uploaded. URL:', publicData.publicUrl);
                    showToast('Emergency Audio securely uploaded ☁️', 'success');
                } else {
                    console.error('[Voice] Audio upload failed:', error);
                    showToast('Audio upload failed: Check bucket permissions', 'error');
                }
            });

            events.emit('recording-stopped');
        };


        _mediaRecorder.start();
        console.log('[Voice] Emergency recording started.');
        
        // Record for specified duration
        setTimeout(() => {
            stopRecording();
        }, durationMs);
    } catch (err) {
        console.error('[Voice] Could not start recording:', err);
        // Explain to User clearly why it's failing
        if (!window.isSecureContext) {
            showToast('Microphone Blocked: Browsers require HTTPS to record audio.', 'error', 6000);
        } else {
            showToast('Microphone Access Denied or Unavailable.', 'error', 4000);
        }
        events.emit('recording-stopped');
    }
}


export function stopRecording() {
    if (_mediaRecorder && _mediaRecorder.state === 'recording') {
        _mediaRecorder.stop();
    }
}

export async function requestMicrophoneAccess() {
    if (!window.isSecureContext) return false;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        return true;
    } catch(err) {
        console.warn('Microphone permission denied or not available:', err);
        return false;
    }
}
