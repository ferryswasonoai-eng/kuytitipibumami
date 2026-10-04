package com.kuytitip.jastip;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Kirim file (mis. invoice PDF) langsung ke chat WhatsApp nomor tertentu,
 * tanpa harus memilih kontak lagi. Memakai extra "jid" yang dikenali WhatsApp.
 */
@CapacitorPlugin(name = "WaShare")
public class WaSharePlugin extends Plugin {

    private static final String[] DEFAULT_PKGS = { "com.whatsapp", "com.whatsapp.w4b" };

    private boolean installed(String pkg) {
        try {
            getContext().getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    @PluginMethod
    public void apps(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("whatsapp", installed("com.whatsapp"));
        ret.put("business", installed("com.whatsapp.w4b"));
        call.resolve(ret);
    }

    @PluginMethod
    public void sendFile(PluginCall call) {
        String path = call.getString("path");
        String phone = call.getString("phone", "");
        String mime = call.getString("mime", "application/pdf");
        String text = call.getString("text", "");
        String prefer = call.getString("pkg", "");
        if (path == null || path.isEmpty()) {
            call.reject("File tidak ada");
            return;
        }
        Uri uri;
        try {
            File f = path.startsWith("file:") ? new File(Uri.parse(path).getPath()) : new File(path);
            uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
        } catch (Exception e) {
            call.reject("File tidak bisa dibagikan: " + e.getMessage());
            return;
        }
        String digits = phone == null ? "" : phone.replaceAll("[^0-9]", "");
        String[] pkgs = (prefer != null && !prefer.isEmpty()) ? new String[] { prefer } : DEFAULT_PKGS;
        for (String pkg : pkgs) {
            if (!installed(pkg)) continue;
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(mime);
            i.setPackage(pkg);
            i.putExtra(Intent.EXTRA_STREAM, uri);
            if (text != null && !text.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, text);
            if (!digits.isEmpty()) i.putExtra("jid", digits + "@s.whatsapp.net");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                getActivity().grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().startActivity(i);
                JSObject ret = new JSObject();
                ret.put("pkg", pkg);
                call.resolve(ret);
                return;
            } catch (ActivityNotFoundException e) {
                // coba aplikasi berikutnya
            } catch (Exception e) {
                call.reject("Gagal membuka WhatsApp: " + e.getMessage());
                return;
            }
        }
        call.reject("WhatsApp tidak ditemukan di HP ini");
    }
}
