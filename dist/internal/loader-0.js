
				{
					__sveltekit_dev = {
						base: ""
					};

					const element = document.currentScript.parentElement;

					Promise.all([
						import("/internal/immutable/entry/start.CknZ-FhG.js"),
						import("/internal/immutable/entry/app.BV9cC53f.js")
					]).then(([kit, app]) => {
						kit.start(app, element);
					});
				}
			