package mx.dentalcrm.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * DentalCRM para Android: abre la app web dentro de un WebView.
 * Orden de carga: GitHub Pages → copia en Vercel → copia incluida en el APK (sin conexión).
 * Así los cambios de la web llegan sin reinstalar, y si la red no llega a GitHub (p. ej. datos Telcel) sigue funcionando.
 */
public class MainActivity extends Activity {
    static final String T = "DentalCRM";
    static final String BASE = "https://jonatan-montiel.github.io/DentalCRM/";
    // Copia en otro servidor por si la compañía de celular no llega a GitHub (como en ale-meses).
    // Vacío hasta crear el proyecto en Vercel; NO poner un dominio que no sea nuestro.
    static final String MIRROR = "";
    static final String LOCAL = "https://appassets.androidplatform.net/assets/www/";
    static final String[] HOSTS = {BASE, MIRROR, LOCAL};

    WebView wv;
    SharedPreferences sp;
    ValueCallback<Uri[]> fileCb;
    WebView printView; // se conserva mientras se imprime
    String host = BASE;
    WebViewAssetLoader assets;

    static boolean ours(String u) {
        if (u == null) return false;
        for (String h : HOSTS) if (!h.isEmpty() && u.startsWith(h)) return true;
        return false;
    }

    long vc() {
        try {
            android.content.pm.PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) { return 0; }
    }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = getSharedPreferences("dc", MODE_PRIVATE);
        assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        crearWebView();
        if (b != null) { wv.restoreState(b); return; }
        elegirHost();
        Updater.check(this);
    }

    void crearWebView() {
        wv = new WebView(this);
        setContentView(wv);
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSupportMultipleWindows(false); // target=_blank pasa por shouldOverrideUrlLoading
        s.setUserAgentString(s.getUserAgentString() + " DentalCRM-Android/" + vc());
        wv.addJavascriptInterface(new Puente(), "DentalAndroid");

        wv.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return assets.shouldInterceptRequest(r.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String u = r.getUrl().toString();
                if (ours(u)) return false;
                // WhatsApp, teléfono, correo, sitios externos → app correspondiente
                try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); }
                catch (Exception e) { Toast.makeText(MainActivity.this, "No hay una app para abrir este enlace", Toast.LENGTH_SHORT).show(); }
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (!r.isForMainFrame()) return;
                Log.w(T, "No cargó " + r.getUrl() + ": " + e.getDescription());
                siguienteHost();
            }

            @Override
            public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse res) {
                if (r.isForMainFrame() && res.getStatusCode() >= 400) siguienteHost();
            }
        });

        wv.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try { startActivityForResult(p.createIntent(), 7); }
                catch (Exception e) { fileCb = null; return false; }
                return true;
            }
        });
    }

    /** Prueba qué servidor responde (rápido) y carga la app desde ahí; si ninguno, usa la copia del APK. */
    void elegirHost() {
        final String preferido = sp.getString("host", BASE);
        new Thread(() -> {
            String elegido = LOCAL;
            String[] orden = !MIRROR.isEmpty() && MIRROR.equals(preferido) ? new String[]{MIRROR, BASE} : new String[]{BASE, MIRROR};
            for (String h : orden) if (!h.isEmpty() && responde(h + "manifest.webmanifest")) { elegido = h; break; }
            final String fin = elegido;
            runOnUiThread(() -> cargar(fin));
        }).start();
    }

    static boolean responde(String u) {
        try {
            HttpURLConnection h = (HttpURLConnection) new URL(u + "?t=" + System.currentTimeMillis()).openConnection();
            h.setConnectTimeout(5000); h.setReadTimeout(5000); h.setRequestMethod("GET"); h.setUseCaches(false);
            int c = h.getResponseCode(); h.disconnect();
            return c == 200;
        } catch (Exception e) { return false; }
    }

    void cargar(String h) {
        host = h;
        if (!LOCAL.equals(h)) sp.edit().putString("host", h).apply();
        Log.i(T, "Cargando desde " + h);
        wv.loadUrl(h + "index.html");
    }

    void siguienteHost() {
        for (int i = 0; i < HOSTS.length - 1; i++) {
            if (HOSTS[i].equals(host)) {
                String sig = HOSTS[i + 1].isEmpty() ? HOSTS[i + 2] : HOSTS[i + 1];
                cargar(sig); return;
            }
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == 7 && fileCb != null) {
            fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    /** Botón atrás: la app web decide (cerrar ventana, regresar de pantalla); si no hay a dónde regresar, sale. */
    @Override
    public void onBackPressed() {
        if (wv == null) { super.onBackPressed(); return; }
        wv.evaluateJavascript("window.__atras ? window.__atras() : false", r -> {
            if (!"true".equals(r)) moveTaskToBack(true);
        });
    }

    @Override protected void onSaveInstanceState(Bundle o) { super.onSaveInstanceState(o); if (wv != null) wv.saveState(o); }
    @Override protected void onResume() { super.onResume(); Updater.check(this); }

    static String nombreSeguro(String n) {
        String s = n == null ? "archivo" : n.toLowerCase().replaceAll("[^a-z0-9._-]", "_");
        if (s.length() > 80) s = s.substring(s.length() - 80);
        return s.startsWith(".") ? "a" + s : s;
    }

    /** Funciones nativas disponibles para la app web como window.DentalAndroid */
    class Puente {
        @JavascriptInterface public long version() { return vc(); }
        @JavascriptInterface public String origen() { return host; }

        @JavascriptInterface
        public void compartir(String nombre, String contenido, String mime) {
            try {
                File dir = new File(getCacheDir(), "share"); dir.mkdirs();
                File f = new File(dir, nombreSeguro(nombre));
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(contenido.getBytes(StandardCharsets.UTF_8)); }
                Uri u = Uri.parse("content://" + getPackageName() + ".share/" + f.getName());
                Intent i = new Intent(Intent.ACTION_SEND).setType(mime == null || mime.isEmpty() ? "*/*" : mime)
                        .putExtra(Intent.EXTRA_STREAM, u).putExtra(Intent.EXTRA_SUBJECT, nombre)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(i, "Guardar o compartir")));
            } catch (Exception e) {
                Log.e(T, "compartir", e);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "No se pudo compartir el archivo", Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface
        public void imprimir(String html, String titulo) {
            runOnUiThread(() -> {
                printView = new WebView(MainActivity.this);
                printView.setWebViewClient(new WebViewClient() {
                    @Override public void onPageFinished(WebView v, String url) {
                        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        String t = titulo == null || titulo.isEmpty() ? "DentalCRM" : titulo;
                        pm.print(t, v.createPrintDocumentAdapter(t), new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.NA_LETTER).build());
                    }
                });
                printView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            });
        }

        @JavascriptInterface
        public void abrir(String url) {
            runOnUiThread(() -> {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
                catch (Exception e) { Toast.makeText(MainActivity.this, "No hay una app para abrir este enlace", Toast.LENGTH_SHORT).show(); }
            });
        }
    }
}
