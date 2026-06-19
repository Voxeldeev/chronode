export default class TutorialManager {
    constructor(pages) {
        this.pages = pages;
        this.currentPage = 0;

        this.overlay = document.getElementById('tutorial-overlay');
        this.modal = document.getElementById('tutorial-modal');
        this.titleEl = document.getElementById('tutorial-title');
        this.bodyEl = document.getElementById('tutorial-body');
        this.pageIndicator = document.getElementById('tut-page');
        
        this.btnPrev = document.getElementById('tut-prev');
        this.btnNext = document.getElementById('tut-next');
        this.btnHelp = document.getElementById('help-btn');

        this._bindEvents();
    }

    _bindEvents() {
        this.btnHelp.addEventListener('click', () => this.open());

        this.btnPrev.addEventListener('click', () => this.navigate(-1));
        this.btnNext.addEventListener('click', () => this.navigate(1));

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.overlay.classList.contains('hidden')) {
                this.close();
            }
        });
    }

    open() {
        this.currentPage = 0;
        this.renderPage();
        this.overlay.classList.remove('hidden');
    }

    close() {
        this.overlay.classList.add('hidden');
    }

    navigate(direction) {
        this.currentPage += direction;
        this.renderPage();
    }

    renderPage() {
        const pageData = this.pages[this.currentPage];
        this.titleEl.textContent = pageData.title;
        this.bodyEl.innerHTML = pageData.content;

        this.pageIndicator.textContent = `${this.currentPage + 1} / ${this.pages.length}`;

        this.btnPrev.disabled = this.currentPage === 0;
        this.btnNext.disabled = this.currentPage === this.pages.length - 1;
    }
}