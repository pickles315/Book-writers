package com.bookwriters.app

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(49, 92, 69)
        window.navigationBarColor = Color.rgb(21, 29, 24)
        NotificationWorker.createChannel(this)
        scheduleBackgroundChecks()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(245, 245, 237))
        }
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
        }
        root.addView(progressBar, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dp(3)
        ))

        webView = WebView(this)
        val notificationBridge = AndroidNotificationBridge()
        webView.addJavascriptInterface(notificationBridge, "BookReadersAndroid")
        webView.addJavascriptInterface(notificationBridge, "BookWritersAndroid")
        root.addView(webView, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f
        ))
        setContentView(root)

        CookieManager.getInstance().setAcceptCookie(true)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadsImagesAutomatically = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            allowContentAccess = true
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val uri = request.url
                val host = uri.host.orEmpty()
                if (host == "pickles315.github.io" && uri.scheme == "https") return false

                if (uri.scheme == "https" || uri.scheme == "http") {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    return true
                }
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                progressBar.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
            }

            override fun onShowFileChooser(
                webView: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback

                val chooserIntent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                        "application/epub+zip",
                        "audio/mpeg",
                        "audio/mp3",
                        "image/*"
                    ))
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false)
                }
                startActivityForResult(
                    Intent.createChooser(chooserIntent, "Choose a book, audiobook, or cover"),
                    FILE_CHOOSER_REQUEST
                )
                return true
            }
        }

        if (savedInstanceState == null) webView.loadUrl(SITE_URL)
        else webView.restoreState(savedInstanceState)
    }

    private fun scheduleBackgroundChecks() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val periodic = PeriodicWorkRequestBuilder<NotificationWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            BACKGROUND_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            periodic
        )
    }

    private fun runBackgroundCheckSoon() {
        val request = OneTimeWorkRequestBuilder<NotificationWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(this).enqueueUniqueWork(
            "bookwriters-notifications-now",
            ExistingWorkPolicy.REPLACE,
            request
        )
    }

    private inner class AndroidNotificationBridge {
        @JavascriptInterface
        fun setSessionToken(value: String?) {
            val token = value?.trim().orEmpty()
            getSharedPreferences(NotificationWorker.PREFS, MODE_PRIVATE).edit()
                .putString(NotificationWorker.TOKEN_KEY, token)
                .apply()
            if (token.isNotEmpty()) runBackgroundCheckSoon()
        }

        @JavascriptInterface
        fun getSessionToken(): String {
            return getSharedPreferences(NotificationWorker.PREFS, MODE_PRIVATE)
                .getString(NotificationWorker.TOKEN_KEY, "").orEmpty()
        }

        @JavascriptInterface
        fun clearSessionToken() {
            getSharedPreferences(NotificationWorker.PREFS, MODE_PRIVATE).edit()
                .remove(NotificationWorker.TOKEN_KEY)
                .apply()
        }

        @JavascriptInterface
        fun requestNotificationPermission() {
            runOnUiThread {
                if (Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                ) {
                    requestPermissions(
                        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                        REQUEST_NOTIFICATION_PERMISSION
                    )
                } else {
                    Toast.makeText(this@MainActivity, "BookReaders notifications are allowed.", Toast.LENGTH_SHORT).show()
                    runBackgroundCheckSoon()
                }
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_NOTIFICATION_PERMISSION) {
            val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
            Toast.makeText(
                this,
                if (granted) "BookReaders notifications enabled." else "Notifications are blocked. You can allow them in Android settings.",
                Toast.LENGTH_LONG
            ).show()
            if (granted) runBackgroundCheckSoon()
        }
    }

    @Deprecated("Deprecated by Android; retained for WebView file chooser compatibility.")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != FILE_CHOOSER_REQUEST) return
        val callback = filePathCallback
        filePathCallback = null
        if (resultCode == RESULT_OK) {
            val uris = data?.clipData?.let { clip ->
                Array(clip.itemCount) { index -> clip.getItemAt(index).uri }
            } ?: data?.data?.let { arrayOf(it) }
            callback?.onReceiveValue(uris)
        } else callback?.onReceiveValue(null)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }

    override fun onDestroy() {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val FILE_CHOOSER_REQUEST = 1001
        private const val REQUEST_NOTIFICATION_PERMISSION = 1002
        private const val BACKGROUND_WORK_NAME = "bookwriters-background-notifications"
        private const val SITE_URL = "https://pickles315.github.io/Book-writers/"
    }
}
