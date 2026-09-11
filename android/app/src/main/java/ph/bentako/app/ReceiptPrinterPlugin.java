package ph.bentako.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ReceiptPrinter")
public class ReceiptPrinterPlugin extends Plugin {
    private WebView receiptView;

    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html");
        String title = call.getString("title", "BentaKo Receipt");
        if (html == null || html.isEmpty()) {
            call.reject("Receipt is empty");
            return;
        }

        getActivity().runOnUiThread(() -> {
            receiptView = new WebView(getContext());
            WebSettings settings = receiptView.getSettings();
            settings.setJavaScriptEnabled(false);
            settings.setLoadsImagesAutomatically(true);
            settings.setDefaultTextEncodingName("UTF-8");
            receiptView.setBackgroundColor(android.graphics.Color.WHITE);
            receiptView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                    if (manager == null) {
                        call.reject("Android print service is unavailable");
                        receiptView = null;
                        return;
                    }

                    PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(title);
                    PrintAttributes attributes = new PrintAttributes.Builder()
                        .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
                        .setMediaSize(new PrintAttributes.MediaSize("BENTAKO_58_105", "58 x 105 mm", 2283, 4134))
                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                        .build();
                    manager.print(title, adapter, attributes);
                    JSObject result = new JSObject();
                    result.put("started", true);
                    call.resolve(result);
                }
            });
            receiptView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }
}