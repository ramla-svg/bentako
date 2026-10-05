package ph.bentako.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintJob;
import android.print.PrintManager;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ReceiptPrinter")
public class ReceiptPrinterPlugin extends Plugin {
    private final Set<WebView> receiptViews = new HashSet<>();

    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html");
        String title = call.getString("title", "BentaKo Receipt");
        if (html == null || html.isEmpty()) {
            call.reject("Receipt is empty");
            return;
        }

        getActivity().runOnUiThread(() -> {
            WebView receiptView = new WebView(getContext());
            receiptViews.add(receiptView);
            WebSettings settings = receiptView.getSettings();
            settings.setJavaScriptEnabled(false);
            settings.setLoadsImagesAutomatically(true);
            settings.setDefaultTextEncodingName("UTF-8");
            receiptView.setBackgroundColor(android.graphics.Color.WHITE);
            AtomicBoolean printStarted = new AtomicBoolean(false);
            receiptView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    if (!printStarted.compareAndSet(false, true)) return;
                    PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                    if (manager == null) {
                        call.reject("Android print service is unavailable");
                        releaseView(receiptView);
                        return;
                    }

                    PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(title);
                    PrintAttributes attributes = new PrintAttributes.Builder()
                        .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
                        .setMediaSize(new PrintAttributes.MediaSize("BENTAKO_58_105", "58 x 105 mm", 2283, 4134))
                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                        .build();
                    PrintJob job = manager.print(title, adapter, attributes);
                    watchPrintJob(job, receiptView);
                    JSObject result = new JSObject();
                    result.put("started", true);
                    call.resolve(result);
                }
            });
            receiptView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }

    private void watchPrintJob(PrintJob job, WebView view) {
        Handler handler = new Handler(Looper.getMainLooper());
        long startedAt = System.currentTimeMillis();
        Runnable watcher = new Runnable() {
            @Override
            public void run() {
                boolean finished = job.isCompleted() || job.isCancelled() || job.isFailed();
                boolean timedOut = System.currentTimeMillis() - startedAt > 300000;
                if (finished || timedOut) {
                    releaseView(view);
                } else {
                    handler.postDelayed(this, 1000);
                }
            }
        };
        handler.postDelayed(watcher, 1000);
    }

    private void releaseView(WebView view) {
        receiptViews.remove(view);
        view.stopLoading();
        view.setWebViewClient(null);
        view.destroy();
    }

    @Override
    protected void handleOnDestroy() {
        for (WebView view : new HashSet<>(receiptViews)) {
            releaseView(view);
        }
        super.handleOnDestroy();
    }
}