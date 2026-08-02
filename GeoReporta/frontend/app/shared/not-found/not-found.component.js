export default {
  template: `
    <div class="container-fluid">
      <div
        class="row justify-content-center align-items-center"
        style="min-height: calc(100vh - 180px)"
      >
        <div class="col-md-6 text-center py-5">
          <i class="fas fa-compass text-muted mb-4" style="font-size: 4rem"></i>
          <h1 class="display-4 fw-bold text-dark mb-2">404</h1>
          <h5 class="text-muted mb-4">Esta sección aún no está disponible.</h5>
          <a href="#/dashboard" class="btn btn-primary">
            <i class="fas fa-home me-2"></i>Volver al Dashboard
          </a>
        </div>
      </div>
    </div>
  `,

  onInit() {},

  onDestroy() {},
};
