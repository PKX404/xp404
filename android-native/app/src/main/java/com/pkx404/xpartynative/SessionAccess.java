package com.pkx404.xpartynative;

import android.service.notification.NotificationListenerService;

// Android grants an enabled listener access to active media sessions.
// XParty does not consume notification content.
public final class SessionAccess extends NotificationListenerService {}
