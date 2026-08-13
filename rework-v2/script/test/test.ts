import "frida-il2cpp-bridge";
import { writeFileToDevice } from "../lib/Utilities.js";

Il2Cpp.perform(() => {
	const assemblies = Il2Cpp.domain.assemblies;
	for(const assembly of assemblies) {
		const klasses = assembly.image.classes;
		for(const klass of klasses) {
			if(klass.tryMethod('Write', 1)) {
				try {
					klass.method('Write', 1).implementation = function(i) {
						console.log(this.class.name);
						return this.method('Write').invoke(i)
					}
				}
				catch(e) {
					console.log('no');
				}
			}
		}
	}
	/*const api = Il2Cpp.domain.assembly('SpaceApe.NewsFeed.API').image;
	const feed = api.class('com.spaceape.newsfeed.NewsFeed');

	feed.method('Read').implementation = function(input) {
		console.log(input.field('ioBuffer').value);
	}*/
	/*const network = Il2Cpp.domain.assembly('SpaceApe.Network').image;
	network.class('EndPointConfig').method('.ctor').implementation = function(host, port, name, secret) {
		if(port === 443) {
			host = Il2Cpp.string("10.0.0.19");
			port = 4000;
		}

		console.log(host, port, name, secret);
		this.method('.ctor').invoke(host, port, name, secret);
		this.field('useSsl').value = false;
	}*/
})