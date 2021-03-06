const createColor = function(color) {
	return {
		background: color
		,boxShadowX: arguments[1] || color
		,boxShadowY: arguments[2] || color
		,textShadow: arguments[3] || color
		,hoverBackground: arguments[4] || color
		,hoverBoxShadowX: arguments[5] || arguments[1] || color
		,hoverBoxShadowY: arguments[6] || arguments[2] || color
		,hoverTextShadow: arguments[7] || arguments[3] || color
	};
};
/**
 * Возвращает случайный короткий (7-значный) идентификатор
 * (некое число в 16-ричной системе счисления, представленное в виде строки).
 * @link http://stackoverflow.com/a/105074
 * @returns {string}
 */
const newId = function() {
  return Math.floor((1 + Math.random()) * 0x10000000)
    .toString(16)
    .substring(1);
};
export default Ember.Component.extend({
	classNames: ['membership-plans']
	/**
	 * 2015-06-29
	 * Discourse expects the components's template at
	 * plugins/df-paid-membership/assets/javascripts/discourse/templates/components/admin-membership-plans.hbs
	 * Until I know it I used to specify template location explicitly:
	 * @link http://stackoverflow.com/a/24271614
	 * ,layoutName: 'javascripts/admin/templates/components/admin-membership-plans'
	 * Now I save the explicit method for history only. May be it will be useful sometimes.
	 */
	,palette: [
		createColor('00aeef', '3dcaff', '0076a3', '009bd6')
		, createColor('f9a41a', 'e9b35c', 'ae7212', 'ae7212', 'c98414', null, '9c6610')
		, createColor('1bb058', '5fc78a', '127b3d', '127b3d', '158c46', '55b37c', '106e36', '106e36')
		, createColor('d13138')
		, createColor('283890')
	]
	,_changed: function() {
		if (this.get('initialized')) {
			Ember.run.once(this, function() {
				this.set('valueS', JSON.stringify(this.get('items')));
			});
		}
	}.observes(
		'items.@each'
		, 'items.@each.color'
		, 'items.@each.description'
		, 'items.@each.id'
		, 'items.@each.title'
		/**
		 * 2015-06-29
		 * Наблюдение за items.@each.grantedGroupIds не работает,
		 * потому что наблюдение, похоже, работает не более чем на два уровня вложенности:
		 * @link https://github.com/emberjs/ember.js/issues/541#issue-3401973
		 * Поэтому мы вызываем _changed() вручную из groupChanged().
		 */
	)
	,_didInsertElement: function() {
		// 2015-07-07
		// Стандартное для Ember.js наблюдение работает лишь на 2 уровня вложенности,
		// поэтому за изменениями палитры мы наблюдаем вручную.
		const _this = this;
		this.$('.hex-input').change(function() {_this._changed()});
	}.on('didInsertElement')
	,_init: function() {
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
		// 2015-06-30
		// Для поддержки предыдущих версий, которые имели другую структуру данных.
		items.forEach(function(plan) {
			if (!plan.id || (-1 < plan.id.indexOf('-'))) {
				plan.id = newId();
			}
			if (!plan.color) {
				plan.color = createColor('f9a41a');
			}
			/** @link http://stackoverflow.com/a/8511350 */
			else if ('object' !== typeof plan.color) {
				plan.color = createColor(plan.color)
			}
		});
		this.set('items', items);
		this.newItem();
		this.set('initialized', true);
	}.on('init')
	,newItem: function() {
		this.set('newId', newId());
		this.set('color', this.palette[Math.floor(this.palette.length * Math.random())]);
		this.set('description', I18n.t('paid_membership.plan.description_placeholder'));
		this.set('grantedGroupIds', []);
		this.set('priceTiers', []);
		this.set('title', I18n.t('paid_membership.plan.title_placeholder'));
	}
	,actions: {
		addItem() {
			if (!this.get('inputInvalid')) {
				var items = this.get('items');
				items.addObject({
					color: this.get('color')
					, description: this.get('description')
					, grantedGroupIds: this.get('grantedGroupIds')
					, id: this.get('newId')
					, priceTiers: this.get('priceTiers')
					, title: this.get('title')
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
			 * У нас пока 1 тип: «granted»
			 * (раньше был ещё «allowed», но убрал за ненадобностью).
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
		,priceTiersChanged(context) {
			if (context.plan) {
				this._changed();
			}
		}
		,removeItem(item) {this.get('items').removeObject(item);}
	}
	,inputInvalid: false
});
