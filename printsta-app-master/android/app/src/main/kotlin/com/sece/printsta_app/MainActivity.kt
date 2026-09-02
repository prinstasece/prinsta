package com.sece.printsta_app

import android.accounts.AccountManager
import android.app.Activity
import android.content.Intent
import androidx.annotation.NonNull
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.sece.printsta_app/auth"
    private val REQUEST_CODE_CHOOSE_ACCOUNT = 1001
    private var pendingResult: MethodChannel.Result? = null

    override fun configureFlutterEngine(@NonNull flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "chooseDeviceAccount") {
                pendingResult = result
                try {
                    val intent = AccountManager.newChooseAccountIntent(
                        null,
                        null,
                        arrayOf("com.google"),
                        null,
                        null,
                        null,
                        null
                    )
                    startActivityForResult(intent, REQUEST_CODE_CHOOSE_ACCOUNT)
                } catch (e: Exception) {
                    result.error("INIT_FAILED", "Failed to launch account chooser: ${e.message}", null)
                    pendingResult = null
                }
            } else {
                result.notImplemented()
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_CODE_CHOOSE_ACCOUNT) {
            val result = pendingResult
            pendingResult = null
            if (resultCode == Activity.RESULT_OK && data != null) {
                val accountName = data.getStringExtra(AccountManager.KEY_ACCOUNT_NAME)
                if (accountName != null) {
                    result?.success(accountName)
                } else {
                    result?.error("NO_ACCOUNT", "No account name returned.", null)
                }
            } else if (resultCode == Activity.RESULT_CANCELED) {
                result?.success(null) // User cancelled
            } else {
                result?.error("FAILED", "Account chooser failed or was cancelled.", null)
            }
        }
    }
}
