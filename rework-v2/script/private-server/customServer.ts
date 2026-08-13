/**
 * Swaps the server IP's for the custom server IP.
 */
export const customServer = () => {
  const network = Il2Cpp.domain.assembly("SpaceApe.Network").image;

  network.class("EndPointConfig").method("get_IsMock").implementation =
    function () {
      this.field("host").value = Il2Cpp.string("beatstarmod.app");
      this.field("port").value = 3000;
      this.field("useSsl").value = false;

      return this.method("get_IsMock").invoke();
    };
};
