export default Ember.Component.extend({
	classNameBindings: [':paid-membership-plans']
	/** @link http://stackoverflow.com/a/24271614/254475 */
	,layoutName: 'javascripts/admin/templates/components/paid-membership-plans'
	,_serialize: function() {this.set('valueS', JSON.stringify(this.get('items')));}
	,onInit: function() {
		/** @type {String} */
		const valueS = this.get('valueS');
		/** @type {Object[]} */
		var items;
		try {
			/** @link http://caniuse.com/#feat=json */
			items = JSON.parse(valueS);
		}
		catch(ignore) {
			items = [];
		}
		this.set('items', items);
		this.newItem();
		this.set('initialized', true);
	}.on('init')
	,_changed: function() {
		if (this.get('initialized')) {
			Ember.run.once(this, '_serialize');
		}
	}.observes(
		'items.@each'
		, 'items.@each.id'
		, 'items.@each.description'
		/**
		 * 2015-06-29
		 * Наблюдение за items.@each.allowedGroupIds и items.@each.allowedGroupIds не работает,
		 * потому что наблюдение, похоже, работает не более чем на два уровня вложенности:
		 * @link https://github.com/emberjs/ember.js/issues/541#issue-3401973
		 * Поэтому мы вызываем _changed() вручную из groupChanged().
		 */
	)
	,newItem: function() {
		this.set('newId', this.generateNewId());
		this.set('allowedGroupIds', []);
		this.set('grantedGroupIds', []);
		this.set('description', I18n.t(
			'admin.site_settings.paid_membership.plan.description_placeholder'
		));
	}
	,generateNewId: function() {
		var items = this.get('items');
		var existingIds = $.map(items, function(item) {
			var matches = item.id.match(/^membership-plan-(\d+)/);
			return !matches || (2 > matches.length) ? 0 : parseInt(matches[1]);
		});
		/** @link http://stackoverflow.com/a/6102340/254475 */
		var max = !existingIds.length ? 0 : Math.max.apply(Math, existingIds);
		return 'membership-plan-' + (max + 1);
	}
	,actions: {
		addItem() {
			if (!this.get('inputInvalid')) {
				var items = this.get('items');
				var id = this.get('newId') || this.generateNewId();
				items.addObject({
					id: id
					, description: this.get('description')
					, allowedGroupIds: this.get('allowedGroupIds')
					, grantedGroupIds: this.get('grantedGroupIds')
				});
				this.newItem();
			}
		}
		,groupChanged(context) {
			const addGroup = function(groupIds) {
				groupIds.push(context.groupId);
			};
			const removeGroup = function(groupIds) {
				var indexToRemove = groupIds.indexOf(context.groupId);
				if (indexToRemove > -1) {
					groupIds.splice(indexToRemove, 1);
				}
			};
			var item = context.item;
			/**
			 * У нас 2 типа: «allowed» и «granted».
			 * @type {string}
			 */
			var groupPropertyName = context.type + 'GroupIds';
			// Если item не указан — значит, операция относится к новому элементу.
			var groupIds =
				item
				// 2015-06-30
				// Такое сложное выражение — для совместимости с прежними версиями,
				// когда свойства grantedGroupIds не существовало.
				? (item[groupPropertyName] || (item[groupPropertyName] = []))
				: this.get(groupPropertyName)
			;
			(context.isAdded ? addGroup : removeGroup).call(this, groupIds);
			/** @link https://github.com/emberjs/ember.js/issues/541#issue-3401973 */
			if (item) {
				this._changed();
			}
		}
		,removeItem(item) {
			const items = this.get('items');
			items.removeObject(item);
		}
	}
	,inputInvalid: false//Ember.computed.empty('allowedGroupIds')
});