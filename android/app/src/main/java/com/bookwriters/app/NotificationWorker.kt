package com.BookReaders.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

class NotificationWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : Worker(appContext, workerParams) {

    override fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val token = prefs.getString(TOKEN_KEY, "").orEmpty()
        if (token.isBlank()) return Result.success()

        var connection: HttpURLConnection? = null
        try {
            connection = (URL(API_URL).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 15000
                readTimeout = 15000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", SUPABASE_KEY)
                setRequestProperty("Authorization", "Bearer $token")
            }
            connection.outputStream.use {
                it.write("""{"action":"notifications"}""".toByteArray(Charsets.UTF_8))
            }
            val status = connection.responseCode
            if (status == 401) {
                prefs.edit().remove(TOKEN_KEY).apply()
                return Result.success()
            }
            if (status !in 200..299) return Result.retry()

            val body = BufferedReader(InputStreamReader(connection.inputStream)).use { it.readText() }
            val notifications = JSONObject(body).optJSONArray("notifications")
            val seen = (prefs.getStringSet(SEEN_IDS_KEY, emptySet()) ?: emptySet()).toMutableSet()
            if (notifications != null) {
                for (index in 0 until notifications.length()) {
                    val item = notifications.optJSONObject(index) ?: continue
                    val id = item.optString("id")
                    if (id.isBlank() || seen.contains(id) || !item.isNull("read_at")) continue
                    if (showNotification(
                            item.optString("title", "BookReaders"),
                            item.optString("message", "You have a library update."),
                            id
                        )
                    ) seen.add(id)
                }
            }
            prefs.edit()
                .putStringSet(SEEN_IDS_KEY, seen)
                .apply()
            return Result.success()
        } catch (_: Exception) {
            return Result.retry()
        } finally {
            connection?.disconnect()
        }
    }

    private fun showNotification(title: String, message: String, id: String): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            applicationContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false

        createChannel(applicationContext)
        val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val openApp = Intent(applicationContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            applicationContext,
            id.hashCode(),
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = if (Build.VERSION.SDK_INT >= 26) {
            Notification.Builder(applicationContext, CHANNEL_ID)
        } else {
            Notification.Builder(applicationContext)
        }
        val notification = builder
            .setSmallIcon(R.drawable.ic_BookReaders)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(Notification.BigTextStyle().bigText(message))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        manager.notify(id.hashCode(), notification)
        return true
    }

    companion object {
        const val PREFS = "BookReaders_notification_prefs"
        const val TOKEN_KEY = "session_token"
        private const val SEEN_IDS_KEY = "seen_notification_ids"
        private const val CHANNEL_ID = "BookReaders_library_updates"
        private const val API_URL = "https://ysomxdoicbfmgbveghkr.supabase.co/functions/v1/library-api"
        private const val SUPABASE_KEY = "sb_publishable_1VtpTU1pGn9yLn6Q_POtsw_Kp5ULXv6"

        fun createChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= 26) {
                val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    "Book and loan updates",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "New releases, due dates, and library updates"
                }
                manager.createNotificationChannel(channel)
            }
        }
    }
}
