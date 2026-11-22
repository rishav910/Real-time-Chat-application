(() => {
    const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const defaultBackendUrl = localHost ? `http://${window.location.hostname}:8080` : 'https://real-time-chat-application-3njs.onrender.com';
    const backendUrl = (document.querySelector('meta[name="chat-backend-url"]')?.content || defaultBackendUrl).replace(/\/$/, '');
    const nameGate = document.getElementById('nameGate');
    const joinForm = document.getElementById('joinForm');
    const joinName = document.getElementById('joinName');
    const appShell = document.getElementById('appShell');
    const chat = document.getElementById('chat');
    const messageStream = document.getElementById('messageStream');
    const emptyState = document.getElementById('emptyState');
    const emptyStateCopy = emptyState.querySelector('span:last-child');
    const form = document.getElementById('composer');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendMessage');
    const sendLabel = document.getElementById('sendLabel');
    const status = document.getElementById('connectionStatus');
    const statusDot = document.getElementById('statusDot');
    const error = document.getElementById('errorMessage');
    const currentName = document.getElementById('currentName');
    const channelTitle = document.querySelector('.header-room h1');
    const channelButtons = [...document.querySelectorAll('[data-channel]')];
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    const imageInput = document.getElementById('imageInput');
    const imageButton = document.getElementById('imageButton');
    const emojiButton = document.getElementById('emojiButton');
    const emojiPicker = document.getElementById('emojiPicker');
    const recordButton = document.getElementById('recordButton');
    const cancelRecordingButton = document.getElementById('cancelRecording');
    const recordingStatus = document.getElementById('recordingStatus');
    const voicePreview = document.getElementById('voicePreview');
    const voicePreviewPlayer = document.getElementById('voicePreviewPlayer');
    const voicePreviewDuration = document.getElementById('voicePreviewDuration');
    const discardVoiceButton = document.getElementById('discardVoice');
    const attachmentStatus = document.getElementById('attachmentStatus');
    const editDialog = document.getElementById('editDialog');
    const editForm = document.getElementById('editForm');
    const editMessageInput = document.getElementById('editMessageInput');
    const closeEditDialogButton = document.getElementById('closeEditDialog');
    const cancelEditButton = document.getElementById('cancelEdit');
    const guestId = window.crypto?.randomUUID?.() || `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channels = channelButtons.map(button => button.dataset.channel);
    const messagesByChannel = new Map(channels.map(channel => [channel, []]));
    const pendingSeenByMessage = new Map();
    const seenRequestsSent = new Set();
    let displayName = '';
    let currentChannel = 'general';
    let client;
    let subscriptions = [];
    let connected = false;
    let connecting = false;
    let retryDelay = 1000;
    let retryTimer;
    let intentionalClose = false;
    let mediaRecorder;
    let mediaStream;
    let recordingChunks = [];
    let recordingTimer;
    let recordingStartedAt = 0;
    let discardRecording = false;
    let recordingSetup = false;
    let uploadInProgress = false;
    let pendingVoiceBlob = null;
    let pendingVoiceUrl = null;
    let seenScanScheduled = false;
    let messageBeingEdited = null;
    const pendingAttachments = [];
    const emojiOptions = [
        ['😀', 'Grinning face'], ['😂', 'Face with tears of joy'], ['😊', 'Smiling face'], ['😍', 'Heart eyes'],
        ['🥰', 'Smiling face with hearts'], ['😎', 'Smiling face with sunglasses'], ['🤔', 'Thinking face'], ['🙌', 'Raising hands'],
        ['👏', 'Clapping hands'], ['👍', 'Thumbs up'], ['❤️', 'Red heart'], ['💚', 'Green heart'],
        ['🎉', 'Party popper'], ['🔥', 'Fire'], ['✨', 'Sparkles'], ['🙏', 'Folded hands'],
        ['😅', 'Grinning face with sweat'], ['😭', 'Loudly crying face'], ['💯', 'Hundred points'], ['👋', 'Waving hand'],
        ['🤗', 'Hugging face'], ['✅', 'Check mark'], ['☕', 'Hot beverage'], ['🚀', 'Rocket']
    ];

    emojiOptions.forEach(([emoji, label]) => {
        const choice = document.createElement('button');
        choice.className = 'emoji-choice';
        choice.type = 'button';
        choice.textContent = emoji;
        choice.title = label;
        choice.setAttribute('aria-label', label);
        choice.addEventListener('click', () => insertEmoji(emoji));
        emojiPicker.append(choice);
    });

    function applyTheme(theme, save = false) {
        const activeTheme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = activeTheme;
        const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
        themeIcon.textContent = activeTheme === 'dark' ? '☀' : '☾';
        themeToggle.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
        themeToggle.title = `Switch to ${nextTheme} theme`;
        document.querySelector('meta[name="theme-color"]').content = activeTheme === 'dark' ? '#191821' : '#f7f6fa';
        if (save) localStorage.setItem('chatty-theme', activeTheme);
    }

    const savedTheme = localStorage.getItem('chatty-theme') || localStorage.getItem('gather-theme') || 'light';
    applyTheme(savedTheme);
    if (!localStorage.getItem('chatty-theme') && localStorage.getItem('gather-theme')) {
        localStorage.setItem('chatty-theme', savedTheme);
        localStorage.removeItem('gather-theme');
    }
    themeToggle.addEventListener('click', () => {
        const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme, true);
    });

    function setStatus(label, state) {
        status.textContent = label;
        statusDot.className = `status-dot${state ? ` is-${state}` : ''}`;
    }

    function updateComposer() {
        messageInput.disabled = !displayName;
        sendButton.disabled = !connected || !displayName || uploadInProgress || recordingSetup || isRecording()
            || (!messageInput.value.trim() && !pendingVoiceBlob);
        sendLabel.textContent = pendingVoiceBlob ? 'Send voice' : 'Send';
        emojiButton.disabled = !displayName;
        imageButton.disabled = !connected || uploadInProgress || isRecording() || Boolean(pendingVoiceBlob);
        recordButton.disabled = uploadInProgress || recordingSetup || Boolean(pendingVoiceBlob) || (!connected && !isRecording());
        cancelRecordingButton.disabled = !isRecording();
        discardVoiceButton.disabled = uploadInProgress;
    }

    function showError(message) {
        error.textContent = message;
        error.hidden = !message;
    }

    function insertEmoji(emoji) {
        const start = messageInput.selectionStart ?? messageInput.value.length;
        const end = messageInput.selectionEnd ?? start;
        messageInput.value = `${messageInput.value.slice(0, start)}${emoji}${messageInput.value.slice(end)}`;
        const cursor = start + emoji.length;
        messageInput.focus();
        messageInput.setSelectionRange(cursor, cursor);
        resizeInput();
        updateComposer();
        emojiPicker.hidden = true;
        emojiButton.setAttribute('aria-expanded', 'false');
    }

    function isRecording() {
        return mediaRecorder?.state === 'recording';
    }

    function updateRecordingClock() {
        const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
        recordingStatus.textContent = `Recording ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        if (seconds >= 120 && isRecording()) {
            recordingStatus.textContent = 'Maximum recording length reached. Preparing…';
            mediaRecorder.stop();
        }
    }

    function formatRecordingDuration(totalSeconds) {
        const seconds = Math.max(0, Math.floor(totalSeconds));
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }

    function resetRecordingControls() {
        clearInterval(recordingTimer);
        recordingTimer = null;
        recordingStatus.hidden = true;
        recordingStatus.textContent = '';
        cancelRecordingButton.hidden = true;
        recordButton.classList.remove('is-recording');
        recordButton.setAttribute('aria-label', 'Record a voice message');
        recordButton.title = 'Record a voice message';
        recordButton.querySelector('span:last-child').textContent = 'Voice';
        updateComposer();
    }

    async function toggleRecording() {
        if (isRecording()) {
            recordingStatus.textContent = 'Preparing voice message…';
            mediaRecorder.stop();
            return;
        }
        if (!connected || uploadInProgress || recordingSetup) return;
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            showError('Voice recording is not available in this browser.');
            return;
        }

        try {
            showError('');
            recordingSetup = true;
            updateComposer();
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            recordingSetup = false;
            const supportedTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
            const mimeType = supportedTypes.find(type => MediaRecorder.isTypeSupported(type));
            mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
            recordingChunks = [];
            discardRecording = false;
            mediaRecorder.addEventListener('dataavailable', event => {
                if (event.data.size) recordingChunks.push(event.data);
            });
            mediaRecorder.addEventListener('stop', async () => {
                const shouldDiscard = discardRecording;
                discardRecording = false;
                const blob = shouldDiscard ? null : new Blob(recordingChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                recordingChunks = [];
                mediaStream?.getTracks().forEach(track => track.stop());
                mediaStream = null;
                if (shouldDiscard) {
                    resetRecordingControls();
                    return;
                }
                if (!blob.size) {
                    resetRecordingControls();
                    showError('The recording was empty. Please try again.');
                    return;
                }
                pendingVoiceBlob = blob;
                const durationSeconds = (Date.now() - recordingStartedAt) / 1000;
                voicePreviewDuration.textContent = formatRecordingDuration(durationSeconds);
                pendingVoiceUrl = URL.createObjectURL(blob);
                voicePreviewPlayer.src = pendingVoiceUrl;
                messageInput.hidden = true;
                voicePreview.hidden = false;
                attachmentStatus.hidden = true;
                attachmentStatus.textContent = '';
                updateComposer();
                resetRecordingControls();
                showError('');
            });
            mediaRecorder.addEventListener('error', () => {
                discardRecording = true;
                mediaStream?.getTracks().forEach(track => track.stop());
                mediaStream = null;
                resetRecordingControls();
                showError('Voice recording failed. Check your microphone and try again.');
            }, { once: true });
            mediaRecorder.start(250);
            recordingStartedAt = Date.now();
            updateRecordingClock();
            recordingTimer = setInterval(updateRecordingClock, 1000);
            recordingStatus.hidden = false;
            cancelRecordingButton.hidden = false;
            recordButton.classList.add('is-recording');
            recordButton.setAttribute('aria-label', 'Stop recording');
            recordButton.title = 'Stop recording and review your voice message';
            recordButton.querySelector('span:last-child').textContent = 'Stop';
            updateComposer();
        } catch (recordingError) {
            recordingSetup = false;
            mediaStream?.getTracks().forEach(track => track.stop());
            mediaStream = null;
            resetRecordingControls();
            showError(recordingError.name === 'NotAllowedError'
                ? 'Allow microphone access to record a voice message.'
                : 'Could not start recording. Please try again.');
        }
    }

    function sendAttachmentMessage(upload, content = '', room = currentChannel) {
        pendingAttachments.push({
            clientId: guestId,
            sender: displayName,
            content,
            room,
            attachmentUrl: upload.url,
            attachmentType: upload.contentType,
            attachmentName: upload.originalName
        });
        flushPendingAttachments();
    }

    function flushPendingAttachments() {
        if (!connected || !client) return;
        while (pendingAttachments.length) {
            try {
                client.send('/app/sendMessage', {}, JSON.stringify(pendingAttachments[0]));
                pendingAttachments.shift();
            } catch {
                showError('Attachment is ready and will be sent when the connection returns.');
                return;
            }
        }
        attachmentStatus.hidden = true;
        attachmentStatus.textContent = '';
    }

    async function uploadAttachment(file, messageContent = '') {
        const isImage = file.type.startsWith('image/');
        const maxSize = isImage ? 10 * 1024 * 1024 : 15 * 1024 * 1024;
        if (file.size > maxSize) {
            showError(isImage ? 'Images must be 10 MB or smaller.' : 'Voice messages must be 15 MB or smaller.');
            return;
        }
        if (!displayName) {
            showError('Enter the chat with a display name before sending an attachment.');
            return;
        }

        uploadInProgress = true;
        const room = currentChannel;
        updateComposer();
        showError('');
        attachmentStatus.textContent = isImage ? 'Uploading image…' : 'Uploading voice message…';
        attachmentStatus.hidden = false;
        const data = new FormData();
        data.append('file', file, file.name || 'voice-message.webm');
        let uploaded = false;
        try {
            const response = await fetch(`${backendUrl}/api/uploads`, { method: 'POST', body: data });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.detail || result.message || 'The attachment could not be uploaded.');
            sendAttachmentMessage(result, messageContent, room);
            uploaded = true;
            if (pendingAttachments.length) {
                attachmentStatus.textContent = 'Attachment ready. Sending when connected…';
                attachmentStatus.hidden = false;
            }
        } catch (uploadError) {
            attachmentStatus.hidden = true;
            showError(uploadError.message || 'The attachment could not be uploaded. Please try again.');
        } finally {
            uploadInProgress = false;
            updateComposer();
        }
        return uploaded;
    }

    function scheduleReconnect() {
        if (intentionalClose || !displayName || !navigator.onLine) return;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
    }

    function markDisconnected(message = 'Connection to the chat server was lost.') {
        if (intentionalClose || (!connected && !connecting)) return;
        connected = false;
        connecting = false;
        subscriptions = [];
        updateComposer();
        setStatus('Not connected', 'error');
        showError(message);
        scheduleReconnect();
    }

    function clearRenderedMessages() {
        messageStream.querySelectorAll('.message-row').forEach(row => row.remove());
        chat.classList.remove('has-messages');
        chat.scrollTop = 0;
    }

    function renderChannelHistory() {
        clearRenderedMessages();
        const messages = messagesByChannel.get(currentChannel) || [];
        emptyStateCopy.textContent = `Send the first message to #${currentChannel} to get things going.`;
        emptyState.hidden = messages.length > 0;
        messages.forEach(renderMessage);
        chat.classList.toggle('has-messages', messages.length > 0);
        scrollToLatest();
    }

    function receiveMessage(message) {
        if (!message) return;
        if (message.type === 'seen') {
            receiveSeenUpdate(message);
            return;
        }
        const hasAttachment = typeof message.attachmentUrl === 'string' && typeof message.attachmentType === 'string';
        if (!messagesByChannel.has(message.room) || typeof message.sender !== 'string'
                || (typeof message.content !== 'string' && !hasAttachment)) return;
        if (typeof message.content !== 'string') message.content = '';
        const channelMessages = messagesByChannel.get(message.room);
        if (message.edited === true && message.deleted !== true) {
            const existing = channelMessages.find(item => item.messageId === message.messageId);
            if (!existing) return;
            existing.content = message.content;
            existing.edited = true;
            if (message.room === currentChannel) {
                const row = [...messageStream.querySelectorAll('.message-row')]
                    .find(item => item.dataset.messageId === message.messageId);
                if (row) row.replaceWith(renderMessage(existing, false));
            }
            return;
        }
        if (message.deleted === true) {
            if (typeof message.messageId !== 'string') return;
            pendingSeenByMessage.delete(message.messageId);
            const existing = channelMessages.find(item => item.messageId === message.messageId);
            if (!existing) {
                channelMessages.push(message);
                if (message.room === currentChannel) renderMessage(message);
                return;
            }
            existing.deleted = true;
            existing.content = '';
            existing.attachmentUrl = null;
            existing.attachmentType = null;
            existing.attachmentName = null;
            if (message.room === currentChannel) {
                const row = [...messageStream.querySelectorAll('.message-row')]
                    .find(item => item.dataset.messageId === message.messageId);
                if (row) row.replaceWith(renderMessage(existing, false));
            }
            return;
        }
        if (message.messageId && channelMessages.some(item => item.messageId === message.messageId)) return;
        const pendingSeen = message.messageId ? pendingSeenByMessage.get(message.messageId) : null;
        if (pendingSeen) {
            message.seenBy = pendingSeen;
            pendingSeenByMessage.delete(message.messageId);
        }
        const wasNearLatest = message.room === currentChannel
            && chat.scrollHeight - chat.clientHeight - chat.scrollTop < 80;
        channelMessages.push(message);
        if (message.room === currentChannel) {
            renderMessage(message);
            if (wasNearLatest) scrollToLatest();
            scheduleMarkVisibleMessagesSeen();
        }
    }

    function receiveSeenUpdate(update) {
        if (!messagesByChannel.has(update.room) || typeof update.messageId !== 'string' || !Array.isArray(update.seenBy)) return;
        const channelMessages = messagesByChannel.get(update.room);
        const existing = channelMessages.find(item => item.messageId === update.messageId);
        if (!existing) {
            pendingSeenByMessage.set(update.messageId, update.seenBy);
            return;
        }
        existing.seenBy = update.seenBy;
        if (update.room === currentChannel) {
            const row = [...messageStream.querySelectorAll('.message-row')]
                .find(item => item.dataset.messageId === update.messageId);
            if (row) row.replaceWith(renderMessage(existing, false));
        }
    }

    function markVisibleMessagesSeen() {
        seenScanScheduled = false;
        if (!connected || !client || document.visibilityState !== 'visible') return;
        const chatBounds = chat.getBoundingClientRect();
        messageStream.querySelectorAll('.message-row[data-message-id]').forEach(row => {
            const bounds = row.getBoundingClientRect();
            if (bounds.bottom <= chatBounds.top || bounds.top >= chatBounds.bottom) return;
            const message = messagesByChannel.get(currentChannel)
                .find(item => item.messageId === row.dataset.messageId);
            if (!message || message.deleted || message.clientId === guestId || seenRequestsSent.has(message.messageId)) return;
            try {
                client.send('/app/markSeen', {}, JSON.stringify({ messageId: message.messageId, room: currentChannel }));
                seenRequestsSent.add(message.messageId);
            } catch { /* A reconnect will refresh the read receipt. */ }
        });
    }

    function scheduleMarkVisibleMessagesSeen() {
        if (seenScanScheduled) return;
        seenScanScheduled = true;
        requestAnimationFrame(markVisibleMessagesSeen);
    }

    function subscribeToChannels() {
        if (!connected || !client) return;
        subscriptions.forEach(subscription => subscription.unsubscribe());
        subscriptions = channels.map(channel => client.subscribe(`/topic/rooms/${channel}`, frame => {
            try { receiveMessage(JSON.parse(frame.body)); }
            catch { showError('A message could not be displayed.'); }
        }));
    }

    function connect() {
        if (intentionalClose || connecting || connected) return;
        if (!navigator.onLine) {
            setStatus('Not connected', 'error');
            showError('You are offline. We’ll reconnect when your internet returns.');
            return;
        }
        if (typeof SockJS === 'undefined' || typeof Stomp === 'undefined') {
            setStatus('Not connected', 'error');
            showError('The chat could not load. Refresh the page to try again.');
            return;
        }
        connecting = true;
        setStatus(retryDelay > 1000 ? 'Reconnecting…' : 'Connecting…');
        const socket = new SockJS(`${backendUrl}/chat`);
        socket.addEventListener('close', () => markDisconnected());
        client = Stomp.over(socket);
        client.debug = () => {};
        client.heartbeat.outgoing = 10000;
        client.heartbeat.incoming = 10000;
        client.connect({}, () => {
            connecting = false;
            connected = true;
            retryDelay = 1000;
            showError('');
            setStatus('Connected', 'connected');
            updateComposer();
            seenRequestsSent.clear();
            try {
                client.send('/app/join', {}, JSON.stringify({ clientId: guestId, sender: displayName }));
            } catch { /* The next reconnect will register the session again. */ }
            subscribeToChannels();
            flushPendingAttachments();
            scheduleMarkVisibleMessagesSeen();
        }, () => markDisconnected('Could not connect to the chat server. Retrying…'));
    }

    function renderMessage(message, append = true) {
        emptyState.hidden = true;
        const row = document.createElement('article');
        const own = message.clientId === guestId;
        row.className = `message-row${own ? ' is-own' : ''}`;
        if (message.messageId) row.dataset.messageId = message.messageId;
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = message.sender.trim().charAt(0).toUpperCase() || '?';
        const content = document.createElement('div');
        content.className = 'message-content';
        const body = document.createElement('div');
        body.className = 'message-body';
        const meta = document.createElement('div');
        meta.className = 'message-meta';
        const sender = document.createElement('strong');
        sender.textContent = message.sender;
        const time = document.createElement('time');
        time.textContent = message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], {
            hour: 'numeric', minute: '2-digit', hour12: true
        }) : 'now';
        meta.append(sender, time);
        if (message.edited && !message.deleted) {
            const editedLabel = document.createElement('span');
            editedLabel.className = 'edited-label';
            editedLabel.textContent = 'edited';
            meta.append(editedLabel);
        }
        if (message.deleted) {
            const deletedNotice = document.createElement('em');
            deletedNotice.className = 'message-deleted';
            deletedNotice.textContent = 'This message was deleted';
            body.append(deletedNotice);
        } else if (message.content?.trim()) {
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';
            bubble.textContent = message.content;
            body.append(bubble);
        }
        if (!message.deleted && typeof message.attachmentUrl === 'string' && message.attachmentUrl.startsWith('/api/uploads/')) {
            const source = new URL(message.attachmentUrl, `${backendUrl}/`).href;
            if (message.attachmentType?.startsWith('image/')) {
                const image = document.createElement('img');
                image.className = 'message-image';
                image.src = source;
                image.alt = message.attachmentName || `Image shared by ${message.sender}`;
                image.loading = 'lazy';
                body.append(image);
            } else if (message.attachmentType?.startsWith('audio/')) {
                const audio = document.createElement('audio');
                audio.className = 'message-audio';
                audio.controls = true;
                audio.preload = 'metadata';
                audio.src = source;
                audio.setAttribute('aria-label', `Voice message from ${message.sender}`);
                body.append(audio);
            }
        }
        content.append(meta, body);
        if (own && !message.deleted && message.seenBy?.length) {
            const seenBy = document.createElement('span');
            seenBy.className = 'seen-by';
            seenBy.textContent = `Seen by ${message.seenBy.join(', ')}`;
            content.append(seenBy);
        }
        if (own && !message.deleted && message.messageId) {
            const actions = document.createElement('div');
            actions.className = 'message-actions';
            const trigger = document.createElement('button');
            trigger.className = 'message-actions-trigger';
            trigger.type = 'button';
            trigger.textContent = '⋯';
            trigger.setAttribute('aria-label', 'Message actions');
            trigger.title = 'Edit or delete this message';
            trigger.setAttribute('aria-haspopup', 'menu');
            trigger.setAttribute('aria-expanded', 'false');
            const menu = document.createElement('div');
            menu.className = 'message-actions-menu';
            menu.setAttribute('role', 'menu');
            menu.hidden = true;
            if (message.content?.trim()) {
                const editButton = document.createElement('button');
                editButton.type = 'button';
                editButton.className = 'message-action-item';
                editButton.setAttribute('role', 'menuitem');
                editButton.textContent = 'Edit message';
                editButton.addEventListener('click', () => {
                    menu.hidden = true;
                    trigger.setAttribute('aria-expanded', 'false');
                    openEditDialog(message);
                });
                menu.append(editButton);
            }
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'message-action-item is-destructive';
            deleteButton.setAttribute('role', 'menuitem');
            deleteButton.textContent = 'Delete message';
            deleteButton.addEventListener('click', () => {
                menu.hidden = true;
                trigger.setAttribute('aria-expanded', 'false');
                deleteMessage(message, deleteButton);
            });
            menu.append(deleteButton);
            trigger.addEventListener('click', event => {
                event.stopPropagation();
                const shouldOpen = menu.hidden;
                closeMessageMenus();
                menu.hidden = !shouldOpen;
                trigger.setAttribute('aria-expanded', String(shouldOpen));
                if (shouldOpen) {
                    const chatBounds = chat.getBoundingClientRect();
                    const triggerBounds = trigger.getBoundingClientRect();
                    const menuHeight = menu.offsetHeight;
                    const roomBelow = chatBounds.bottom - triggerBounds.bottom;
                    const roomAbove = triggerBounds.top - chatBounds.top;
                    menu.classList.toggle('opens-up', roomBelow < menuHeight && roomAbove > roomBelow);
                }
            });
            actions.append(trigger, menu);
            body.append(actions);
        }
        row.append(avatar, content);
        if (append) messageStream.appendChild(row);
        chat.classList.add('has-messages');
        return row;
    }

    function scrollToLatest() {
        chat.scrollTop = chat.scrollHeight;
    }

    function deleteMessage(message, button) {
        if (!connected || !client || !message.messageId || button.disabled) return;
        button.disabled = true;
        try {
            client.send('/app/deleteMessage', {}, JSON.stringify({ messageId: message.messageId, room: message.room }));
        } catch {
            button.disabled = false;
            showError('The message could not be deleted. Please try again.');
        }
    }

    function openEditDialog(message) {
        messageBeingEdited = message;
        editMessageInput.value = message.content;
        editDialog.showModal();
        editMessageInput.focus();
        editMessageInput.setSelectionRange(editMessageInput.value.length, editMessageInput.value.length);
    }

    function closeEditDialog() {
        if (editDialog.open) editDialog.close();
        messageBeingEdited = null;
    }

    function closeMessageMenus() {
        document.querySelectorAll('.message-actions-menu:not([hidden])').forEach(menu => {
            menu.hidden = true;
            menu.parentElement?.querySelector('.message-actions-trigger')?.setAttribute('aria-expanded', 'false');
        });
    }

    async function sendMessage(event) {
        event.preventDefault();
        const content = messageInput.value.trim();
        if (!connected || !client || !displayName) return;
        if (pendingVoiceBlob) {
            const blob = pendingVoiceBlob;
            const extension = blob.type.startsWith('audio/mp4') ? 'm4a' : blob.type.startsWith('audio/ogg') ? 'ogg' : 'webm';
            const uploaded = await uploadAttachment(new File([blob], `voice-message.${extension}`, { type: blob.type }), content);
            if (uploaded) {
                clearPendingVoice();
                if (messageInput.value.trim() === content) {
                    messageInput.value = '';
                    resizeInput();
                }
                updateComposer();
                showError('');
            }
            return;
        }
        if (!content) return;
        try {
            client.send('/app/sendMessage', {}, JSON.stringify({ clientId: guestId, sender: displayName, content, room: currentChannel }));
            messageInput.value = '';
            resizeInput();
            updateComposer();
            showError('');
        } catch {
            showError('Your message could not be sent. Please try again.');
        }
    }

    function clearPendingVoice() {
        pendingVoiceBlob = null;
        if (pendingVoiceUrl) URL.revokeObjectURL(pendingVoiceUrl);
        pendingVoiceUrl = null;
        voicePreviewPlayer.removeAttribute('src');
        voicePreviewPlayer.load();
        voicePreview.hidden = true;
        messageInput.hidden = false;
        voicePreviewDuration.textContent = '0:00';
        resizeInput();
        updateComposer();
    }

    function resizeInput() {
        messageInput.style.height = 'auto';
        messageInput.style.height = `${Math.min(messageInput.scrollHeight, 130)}px`;
    }

    function selectChannel(channel) {
        if (channel === currentChannel) return;
        currentChannel = channel;
        channelTitle.textContent = channel;
        document.querySelector('.chat-panel').setAttribute('aria-label', `${channel} chat`);
        messageInput.placeholder = `Say something in #${channel}…`;
        channelButtons.forEach(button => {
            const active = button.dataset.channel === channel;
            button.classList.toggle('is-active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
        renderChannelHistory();
        messageInput.focus();
        scheduleMarkVisibleMessagesSeen();
    }

    joinForm.addEventListener('submit', event => {
        event.preventDefault();
        displayName = joinName.value.trim().slice(0, 32);
        if (!displayName) {
            joinName.focus();
            return;
        }
        currentName.textContent = displayName;
        nameGate.hidden = true;
        appShell.hidden = false;
        updateComposer();
        connect();
        messageInput.focus();
    });

    channelButtons.forEach(button => button.addEventListener('click', () => selectChannel(button.dataset.channel)));
    chat.addEventListener('scroll', scheduleMarkVisibleMessagesSeen, { passive: true });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') scheduleMarkVisibleMessagesSeen();
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('.message-actions')) closeMessageMenus();
        if (!event.target.closest('#emojiPicker') && !event.target.closest('#emojiButton')) {
            emojiPicker.hidden = true;
            emojiButton.setAttribute('aria-expanded', 'false');
        }
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeMessageMenus();
        if (event.key === 'Escape' && !emojiPicker.hidden) {
            emojiPicker.hidden = true;
            emojiButton.setAttribute('aria-expanded', 'false');
            emojiButton.focus();
        }
    });
    editForm.addEventListener('submit', event => {
        event.preventDefault();
        const content = editMessageInput.value.trim();
        if (!connected || !client || !messageBeingEdited || !content) return;
        try {
            client.send('/app/editMessage', {}, JSON.stringify({
                messageId: messageBeingEdited.messageId,
                room: messageBeingEdited.room,
                content
            }));
            closeEditDialog();
        } catch {
            showError('The message could not be updated. Please try again.');
        }
    });
    closeEditDialogButton.addEventListener('click', closeEditDialog);
    cancelEditButton.addEventListener('click', closeEditDialog);
    editDialog.addEventListener('close', () => { messageBeingEdited = null; });
    imageButton.addEventListener('click', () => imageInput.click());
    emojiButton.addEventListener('click', () => {
        const open = emojiPicker.hidden;
        emojiPicker.hidden = !open;
        emojiButton.setAttribute('aria-expanded', String(open));
    });
    imageInput.addEventListener('change', () => {
        const [file] = imageInput.files || [];
        if (file) uploadAttachment(file);
        imageInput.value = '';
    });
    recordButton.addEventListener('click', toggleRecording);
    discardVoiceButton.addEventListener('click', clearPendingVoice);
    cancelRecordingButton.addEventListener('click', () => {
        if (!isRecording()) return;
        discardRecording = true;
        recordingStatus.textContent = 'Deleting recording…';
        mediaRecorder.stop();
    });
    messageInput.addEventListener('input', () => { resizeInput(); updateComposer(); });
    messageInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (!sendButton.disabled) form.requestSubmit();
        }
    });
    form.addEventListener('submit', sendMessage);
    window.addEventListener('offline', () => {
        clearTimeout(retryTimer);
        const previousClient = client;
        client = null;
        connected = false;
        connecting = false;
        subscriptions = [];
        updateComposer();
        setStatus('Not connected', 'error');
        showError('You are offline. We’ll reconnect when your internet returns.');
        if (previousClient?.connected) previousClient.disconnect(() => {});
    });
    window.addEventListener('online', () => {
        if (!connected && !connecting && displayName) connect();
    });
    window.addEventListener('beforeunload', () => {
        intentionalClose = true;
        clearTimeout(retryTimer);
        discardRecording = true;
        mediaStream?.getTracks().forEach(track => track.stop());
        if (pendingVoiceUrl) URL.revokeObjectURL(pendingVoiceUrl);
        if (client?.connected) client.disconnect();
    });
})();
