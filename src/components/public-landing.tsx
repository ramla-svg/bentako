import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  Menu,
  ShoppingCart,
  Store,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import shopPhoto from "@/assets/landing-shop.jpg";
import ownerPhoto from "@/assets/landing-owner.jpg";

function StartButton({ light = false }: { light?: boolean }) {
  return (
    <Button asChild className={light ? "landing-button landing-button-light" : "landing-button"}>
      <Link to="/auth" search={{ mode: "signup" }}>
        Magsimula nang libre <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}

function Brand() {
  return (
    <span className="landing-brand">
      <span className="landing-brand-icon">
        <Store aria-hidden="true" />
      </span>
      BentaKo
    </span>
  );
}

function SamplePhone() {
  return (
    <figure
      id="sample-preview"
      className="landing-preview"
      tabIndex={-1}
      aria-label="Sample BentaKo dashboard, demonstration numbers only"
    >
      <div className="sample-phone">
        <div className="sample-camera" />
        <div className="sample-status">
          <span>9:41</span>
          <span>● ▰</span>
        </div>
        <div className="sample-top">
          <Brand />
          <span className="sample-avatar">AN</span>
        </div>
        <p className="sample-greeting">Magandang araw, Aling Nena ☀</p>
        <div className="sample-sales">
          <span>Sales today</span>
          <strong>₱2,450.00</strong>
          <div className="sample-profit">
            Profit <b>₱420.00</b>
          </div>
          <div className="sample-stats">
            <span>
              Transactions<b>18</b>
            </span>
            <span>
              Items Sold<b>32</b>
            </span>
          </div>
          <div className="sample-new-sale">
            <ShoppingCart size={14} /> New Sale
          </div>
        </div>
        <div className="sample-tiles">
          <div className="sample-tile peach">
            <Wallet size={17} />
            <span>Gastos</span>
            <b>₱180</b>
          </div>
          <div className="sample-tile mint">
            <Box size={17} />
            <span>Low Stock</span>
            <b>3 items</b>
          </div>
          <div className="sample-tile sky">
            <Wallet size={17} />
            <span>GCash</span>
            <b>₱320</b>
          </div>
          <div className="sample-tile lavender">
            <Users size={17} />
            <span>Utang</span>
            <b>₱1,250</b>
          </div>
        </div>
        <p className="sample-products-title">
          Mga produkto <ChevronRight size={13} />
        </p>
        <div className="sample-products">
          {["Bigas", "Kape", "Sardinas"].map((name, index) => (
            <div key={name}>
              <span
                className={`sample-product-image product-${index}`}
                role="img"
                aria-label={name}
              >
                <svg viewBox="0 0 44 44" width="35" height="35" aria-hidden="true">
                  {index === 2 ? (
                    <>
                      <rect x="11" y="9" width="22" height="28" rx="4" fill="var(--primary)" />
                      <ellipse cx="22" cy="9" rx="11" ry="3" fill="var(--border)" />
                      <rect x="12" y="18" width="20" height="10" fill="var(--landing-peach)" />
                      <path d="M16 23h12" stroke="var(--primary)" />
                    </>
                  ) : (
                    <>
                      <path
                        d="M12 5h20l-2 7 4 25H10l4-25z"
                        fill={index === 0 ? "var(--landing-peach)" : "var(--primary)"}
                        stroke="var(--border)"
                      />
                      <rect
                        x="14"
                        y="16"
                        width="16"
                        height="12"
                        rx="2"
                        fill="var(--landing-white)"
                      />
                      <path d="M18 20h8m-8 4h8" stroke="var(--primary)" />
                    </>
                  )}
                </svg>
              </span>
              <span>{name}</span>
            </div>
          ))}
        </div>
        <div className="sample-bottom">
          <Store size={17} />
          <ShoppingCart size={17} />
          <Box size={17} />
          <Users size={17} />
        </div>
      </div>
      <figcaption>Sample screen · Halimbawang mga numero</figcaption>
    </figure>
  );
}

export function PublicLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="public-landing" lang="fil">
      <a href="#main-content" className="landing-skip">
        Laktawan sa nilalaman
      </a>
      <header className="landing-header landing-container">
        <Link to="/" aria-label="BentaKo home">
          <Brand />
        </Link>
        <nav className="landing-desktop-nav" aria-label="Pangunahing menu">
          <a href="#mga-tampok">Mga Tampok</a>
          <a href="#paano-gumagana">Paano Gumagana</a>
        </nav>
        <div className="landing-header-actions">
          <Button asChild variant="outline" className="landing-signin">
            <Link to="/auth" search={{ mode: "signin" }}>
              Mag-sign in
            </Link>
          </Button>
          <StartButton />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="landing-menu-toggle"
          aria-label={menuOpen ? "Isara ang menu" : "Buksan ang menu"}
          aria-expanded={menuOpen}
          aria-controls="landing-mobile-menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X /> : <Menu />}
        </Button>
        {menuOpen && (
          <nav id="landing-mobile-menu" className="landing-mobile-nav" aria-label="Mobile menu">
            <a href="#mga-tampok" onClick={() => setMenuOpen(false)}>
              Mga Tampok
            </a>
            <a href="#paano-gumagana" onClick={() => setMenuOpen(false)}>
              Paano Gumagana
            </a>
            <Link to="/auth" search={{ mode: "signin" }}>
              Mag-sign in
            </Link>
            <StartButton />
          </nav>
        )}
      </header>
      <main id="main-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-photo">
            <img
              src={shopPhoto}
              alt="Counter at mga paninda sa isang sari-sari store"
              width={1280}
              height={1024}
              fetchPriority="high"
            />
          </div>
          <div className="landing-hero-inner landing-container">
            <div className="landing-hero-copy">
              <span className="landing-eyebrow">
                <span />
                Para sa iyong sari-sari store
              </span>
              <h1 id="landing-title">
                May benta ka.
                <br />
                Alam mo ba ang
                <br />
                <span className="landing-underline">kinita</span> mo?
              </h1>
              <p className="landing-subtitle">
                Itala ang benta, bantayan ang stock, at subaybayan ang utang—sa isang app.
              </p>
              <div className="landing-hero-actions">
                <StartButton />
                <Button asChild variant="ghost" className="landing-view">
                  <a href="#sample-preview">
                    Tingnan ang app <ChevronRight />
                  </a>
                </Button>
              </div>
              <ul className="landing-reassurance">
                {["May libreng plano", "Offline na pagtatala", "Simple at madaling gamitin"].map(
                  (text) => (
                    <li key={text}>
                      <Check aria-hidden="true" />
                      {text}
                    </li>
                  ),
                )}
              </ul>
            </div>
            <SamplePhone />
          </div>
        </section>
        <section
          id="mga-tampok"
          className="landing-features landing-container"
          aria-labelledby="features-title"
        >
          <span className="landing-section-label">KASAMA MO SA ARAW-ARAW</span>
          <h2 id="features-title">Mas malinaw ang takbo ng tindahan.</h2>
          <div className="landing-feature-grid">
            {[
              {
                title: "Benta",
                text: "Itala ang bawat transaksyon.",
                Icon: ShoppingCart,
                tone: "mint",
              },
              {
                title: "Stock",
                text: "Alamin kung ano ang dapat i-restock.",
                Icon: Box,
                tone: "peach",
              },
              {
                title: "Utang",
                text: "Subaybayan ang balanse ng customer.",
                Icon: Users,
                tone: "lavender",
              },
            ].map(({ title, text, Icon, tone }) => (
              <article className="landing-feature" key={title}>
                <span className={`landing-feature-icon ${tone}`}>
                  <Icon aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="paano-gumagana" className="landing-steps" aria-labelledby="steps-title">
          <div className="landing-container">
            <span className="landing-section-label">KONTING TAP. MALAKING LINAW.</span>
            <h2 id="steps-title">Simulan sa 3 madaling hakbang.</h2>
            <ol className="landing-step-grid">
              {["Gumawa ng store", "Idagdag ang produkto", "Itala ang unang benta"].map(
                (text, i) => (
                  <li key={text}>
                    <span className="landing-step-number">{i + 1}</span>
                    <h3>{text}</h3>
                  </li>
                ),
              )}
            </ol>
            <p className="landing-internet-note">
              Kailangan ng internet para sa unang pag-sign in.
            </p>
          </div>
        </section>
        <section className="landing-bottom-wrap landing-container" aria-labelledby="bottom-title">
          <div className="landing-bottom-cta">
            <div className="landing-bottom-copy">
              <h2 id="bottom-title">
                Mas organisadong tindahan.
                <br />
                Simulan sa BentaKo.
              </h2>
              <StartButton light />
              <p>Benta • Imbentaryo • Utang • Gastos</p>
            </div>
            <img
              src={ownerPhoto}
              alt="Masayang may-ari sa counter ng sari-sari store; larawang ilustrasyon"
              width={1024}
              height={768}
              loading="lazy"
            />
          </div>
        </section>
      </main>
      <footer className="landing-footer landing-container">
        <Link to="/" aria-label="BentaKo home">
          <Brand />
        </Link>
        <span>Para sa bawat tindahang Pilipino.</span>
        <nav aria-label="Legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}
